// 顔認証パイプライン(InsightFace buffalo_l 相当の処理を Rust で再実装)。
//
// 1. det_10g.onnx (SCRFD)      : 顔検出 + 5点キーポイント
// 2. 2d106det.onnx             : 106点ランドマーク(アライメント精度向上用)
// 3. w600k_r50.onnx (ArcFace)  : 512次元 embedding 抽出
//
// 前処理・デコードは insightface python-package の実装
// (scrfd.py / landmark.py / face_align.py / arcface_onnx.py)に合わせている。
use ndarray::Array4;

use super::geometry::{
    apply_affine, estimate_similarity, invert_affine, letterbox, nms, warp_affine, Affine, DetBox,
    RgbBuf,
};
use super::runtime::{elapsed_ms, load_session, run_single_input, Session};
use std::time::Instant;

/// SCRFD の入力サイズ。buffalo_l 標準は 640 だが、本キオスクは近距離の
/// 大きな顔だけ検出できればよく、i7-3770(AVX2非対応)での処理時間を
/// 優先して小さめにしている。
const DET_INPUT_SIZE: usize = 320;
/// SCRFD の検出スコア閾値・NMS IoU閾値(insightface デフォルト)
const DET_SCORE_THRESHOLD: f32 = 0.5;
const DET_NMS_THRESHOLD: f32 = 0.4;
const DET_STRIDES: [usize; 3] = [8, 16, 32];
const DET_NUM_ANCHORS: usize = 2;

/// 2d106det の入力サイズと、bbox に対する切り出し倍率(landmark.py 準拠)
const LMK_INPUT_SIZE: usize = 192;
const LMK_CROP_ENLARGE: f32 = 1.5;

/// ArcFace の入力サイズとアライメント基準点(face_align.py の arcface_dst)
const REC_INPUT_SIZE: usize = 112;
const ARCFACE_DST: [[f32; 2]; 5] = [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
];

// 106点ランドマークから ArcFace アライメント用の5点を導く際のインデックス。
// 配置は insightface の 2d106 markup 準拠:
//   33..=42  : 画像左側の目の輪郭(平均を目の中心として使う)
//   87..=96  : 画像右側の目の輪郭
//   86       : 鼻先
//   52 / 61  : 口角(画像左 / 画像右)
const LMK_EYE_LEFT_RANGE: std::ops::RangeInclusive<usize> = 33..=42;
const LMK_EYE_RIGHT_RANGE: std::ops::RangeInclusive<usize> = 87..=96;
const LMK_NOSE_TIP: usize = 86;
const LMK_MOUTH_LEFT: usize = 52;
const LMK_MOUTH_RIGHT: usize = 61;

pub struct FaceDetection {
    /// 元フレーム座標の [x1, y1, x2, y2]
    pub bbox: [f32; 4],
    pub score: f32,
    /// SCRFD の5点キーポイント(左目・右目・鼻・左口角・右口角)
    pub kps: [[f32; 2]; 5],
}

pub struct FaceEngine {
    det: Session,
    landmark: Session,
    recognition: Session,
}

impl FaceEngine {
    pub fn load(paths: &super::paths::ModelPaths) -> Result<Self, String> {
        Ok(Self {
            det: load_session("face-det(det_10g)", &paths.face_det)?,
            landmark: load_session("face-landmark(2d106det)", &paths.face_landmark)?,
            recognition: load_session("face-recognition(w600k_r50)", &paths.face_recognition)?,
        })
    }

    /// SCRFD による顔検出。スコア降順で返す。
    pub fn detect(&mut self, frame: &RgbBuf) -> Result<Vec<FaceDetection>, String> {
        let started = Instant::now();
        let lb = letterbox(frame, DET_INPUT_SIZE, false);

        // NCHW / RGB / (x - 127.5) / 128 (scrfd.py の blobFromImage 相当)
        let mut input = Array4::<f32>::zeros((1, 3, DET_INPUT_SIZE, DET_INPUT_SIZE));
        for y in 0..DET_INPUT_SIZE {
            for x in 0..DET_INPUT_SIZE {
                let i = (y * DET_INPUT_SIZE + x) * 3;
                for c in 0..3 {
                    input[[0, c, y, x]] = (lb.image.data[i + c] as f32 - 127.5) / 128.0;
                }
            }
        }

        let outputs = run_single_input(&mut self.det, input.into_dyn())?;
        if outputs.len() != 9 {
            return Err(format!(
                "det_10g の出力数が想定(9)と異なります: {}",
                outputs.len()
            ));
        }

        // 出力順: scores(stride 8,16,32), bbox(×stride), kps(×stride)
        let mut candidates: Vec<DetBox> = Vec::new();
        for (idx, &stride) in DET_STRIDES.iter().enumerate() {
            let scores = &outputs[idx];
            let bbox_preds = &outputs[idx + 3];
            let kps_preds = &outputs[idx + 6];

            let grid = DET_INPUT_SIZE / stride;
            let count = grid * grid * DET_NUM_ANCHORS;
            let scores = scores.view().into_shape_with_order((count,)).map_err(|e| e.to_string())?;
            let bbox_preds = bbox_preds
                .view()
                .into_shape_with_order((count, 4))
                .map_err(|e| e.to_string())?;
            let kps_preds = kps_preds
                .view()
                .into_shape_with_order((count, 10))
                .map_err(|e| e.to_string())?;

            for i in 0..count {
                let score = scores[i];
                if score < DET_SCORE_THRESHOLD {
                    continue;
                }
                // アンカー中心はグリッド座標 × stride(各セルに2アンカー)
                let cell = i / DET_NUM_ANCHORS;
                let cx = ((cell % grid) * stride) as f32;
                let cy = ((cell / grid) * stride) as f32;

                let d = [
                    bbox_preds[[i, 0]] * stride as f32,
                    bbox_preds[[i, 1]] * stride as f32,
                    bbox_preds[[i, 2]] * stride as f32,
                    bbox_preds[[i, 3]] * stride as f32,
                ];
                let bbox = [cx - d[0], cy - d[1], cx + d[2], cy + d[3]];

                let mut kps = Vec::with_capacity(5);
                for k in 0..5 {
                    kps.push([
                        cx + kps_preds[[i, k * 2]] * stride as f32,
                        cy + kps_preds[[i, k * 2 + 1]] * stride as f32,
                    ]);
                }
                candidates.push(DetBox { bbox, score, kps });
            }
        }

        let kept = nms(candidates, DET_NMS_THRESHOLD);
        // レターボックス座標 → 元フレーム座標(左上詰めなのでスケールのみ)
        let results = kept
            .into_iter()
            .map(|d| {
                let s = lb.scale;
                let mut kps = [[0.0f32; 2]; 5];
                for (dst, src) in kps.iter_mut().zip(&d.kps) {
                    *dst = [src[0] / s, src[1] / s];
                }
                FaceDetection {
                    bbox: [
                        d.bbox[0] / s,
                        d.bbox[1] / s,
                        d.bbox[2] / s,
                        d.bbox[3] / s,
                    ],
                    score: d.score,
                    kps,
                }
            })
            .collect::<Vec<_>>();

        eprintln!(
            "[vision] 顔検出: {}ms ({}件)",
            elapsed_ms(started),
            results.len()
        );
        Ok(results)
    }

    /// 2d106det による106点ランドマークを推定し、全点を元フレーム座標で返す。
    /// bbox が極端に小さい場合は None。オーバーレイ描画とアライメント点導出の
    /// 両方の元データになる。
    pub fn landmarks_106(
        &mut self,
        frame: &RgbBuf,
        bbox: &[f32; 4],
    ) -> Result<Option<Vec<[f32; 2]>>, String> {
        let started = Instant::now();
        let w = bbox[2] - bbox[0];
        let h = bbox[3] - bbox[1];
        if w <= 1.0 || h <= 1.0 {
            return Ok(None);
        }
        let center = ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0);
        let scale = LMK_INPUT_SIZE as f32 / (w.max(h) * LMK_CROP_ENLARGE);

        // landmark.py の face_align.transform(回転なし)相当:
        // スケール後に bbox 中心が入力画像の中心に来る平行移動
        let half = (LMK_INPUT_SIZE / 2) as f32;
        let m: Affine = [
            [scale, 0.0, half - center.0 * scale],
            [0.0, scale, half - center.1 * scale],
        ];
        let crop = warp_affine(frame, &m, LMK_INPUT_SIZE, LMK_INPUT_SIZE);

        // 2d106det (mxnet系)は mean=0 / std=1 の生値・RGB 入力
        let mut input = Array4::<f32>::zeros((1, 3, LMK_INPUT_SIZE, LMK_INPUT_SIZE));
        for y in 0..LMK_INPUT_SIZE {
            for x in 0..LMK_INPUT_SIZE {
                let i = (y * LMK_INPUT_SIZE + x) * 3;
                for c in 0..3 {
                    input[[0, c, y, x]] = crop.data[i + c] as f32;
                }
            }
        }

        let outputs = run_single_input(&mut self.landmark, input.into_dyn())?;
        let pred = outputs
            .first()
            .ok_or("2d106det の出力がありません")?
            .view()
            .into_shape_with_order((106, 2))
            .map_err(|e| format!("2d106det の出力形状が想定外です: {e}"))?
            .to_owned();

        // 出力は [-1, 1] 正規化座標 → クロップ座標 → 逆変換で元フレーム座標へ
        let inv = invert_affine(&m);
        let pts: Vec<[f32; 2]> = (0..106)
            .map(|i| {
                let cx = (pred[[i, 0]] + 1.0) * half;
                let cy = (pred[[i, 1]] + 1.0) * half;
                let (fx, fy) = apply_affine(&inv, cx, cy);
                [fx, fy]
            })
            .collect();

        eprintln!("[vision] 106点ランドマーク: {}ms", elapsed_ms(started));
        Ok(Some(pts))
    }

    /// 106点ランドマークから ArcFace アライメント用の5点(目の中心×2・鼻先・
    /// 口角×2)を導く。妥当性チェック(bbox 近傍に収まるか)に通らなければ
    /// None(呼び出し側で SCRFD の5点へフォールバックする)。
    pub fn refine_keypoints(
        &mut self,
        frame: &RgbBuf,
        bbox: &[f32; 4],
    ) -> Result<Option<[[f32; 2]; 5]>, String> {
        let Some(pts) = self.landmarks_106(frame, bbox)? else {
            return Ok(None);
        };
        Ok(align_kps_from_106(&pts, bbox))
    }

    /// 5点キーポイントで ArcFace 基準にアライメントし、512次元の
    /// 正規化済み embedding を返す。
    pub fn embed(&mut self, frame: &RgbBuf, kps: &[[f32; 2]; 5]) -> Result<Vec<f32>, String> {
        let started = Instant::now();
        let m = estimate_similarity(kps, &ARCFACE_DST);
        let aligned = warp_affine(frame, &m, REC_INPUT_SIZE, REC_INPUT_SIZE);

        // arcface_onnx.py: mean=127.5 / std=127.5 / RGB
        let mut input = Array4::<f32>::zeros((1, 3, REC_INPUT_SIZE, REC_INPUT_SIZE));
        for y in 0..REC_INPUT_SIZE {
            for x in 0..REC_INPUT_SIZE {
                let i = (y * REC_INPUT_SIZE + x) * 3;
                for c in 0..3 {
                    input[[0, c, y, x]] = (aligned.data[i + c] as f32 - 127.5) / 127.5;
                }
            }
        }

        let outputs = run_single_input(&mut self.recognition, input.into_dyn())?;
        let raw = outputs.first().ok_or("w600k_r50 の出力がありません")?;
        let flat: Vec<f32> = raw.iter().copied().collect();
        if flat.len() != 512 {
            return Err(format!(
                "embedding の次元が想定(512)と異なります: {}",
                flat.len()
            ));
        }

        let norm = flat.iter().map(|v| v * v).sum::<f32>().sqrt().max(1e-12);
        let embedding = flat.into_iter().map(|v| v / norm).collect();
        eprintln!("[vision] embedding抽出: {}ms", elapsed_ms(started));
        Ok(embedding)
    }
}

/// 106点ランドマーク(フレーム座標)から ArcFace アライメント用の5点を導く。
/// 妥当でなければ None。
pub fn align_kps_from_106(pts: &[[f32; 2]], bbox: &[f32; 4]) -> Option<[[f32; 2]; 5]> {
    if pts.len() < 106 {
        return None;
    }
    let mean_of = |range: std::ops::RangeInclusive<usize>| -> [f32; 2] {
        let mut sx = 0.0f32;
        let mut sy = 0.0f32;
        let count = range.clone().count() as f32;
        for i in range {
            sx += pts[i][0];
            sy += pts[i][1];
        }
        [sx / count, sy / count]
    };

    let kps = [
        mean_of(LMK_EYE_LEFT_RANGE),
        mean_of(LMK_EYE_RIGHT_RANGE),
        pts[LMK_NOSE_TIP],
        pts[LMK_MOUTH_LEFT],
        pts[LMK_MOUTH_RIGHT],
    ];

    // 妥当性チェック: 5点全てが bbox を少し広げた範囲に収まっていること
    let w = bbox[2] - bbox[0];
    let h = bbox[3] - bbox[1];
    let margin = w.max(h) * 0.5;
    let in_range = kps.iter().all(|p| {
        p[0].is_finite()
            && p[1].is_finite()
            && p[0] >= bbox[0] - margin
            && p[0] <= bbox[2] + margin
            && p[1] >= bbox[1] - margin
            && p[1] <= bbox[3] + margin
    });
    if in_range {
        Some(kps)
    } else {
        None
    }
}

/// 正規化済み embedding 同士のコサイン類似度
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}
