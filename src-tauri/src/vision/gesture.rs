// ジェスチャー認識パイプライン(OpenCV Zoo の MediaPipe 変換モデルを使用)。
//
// 1. palm_detection_mediapipe_2023feb.onnx : 手のひら検出(bbox + 7点)
// 2. handpose_estimation_mediapipe_2023feb.onnx : 21点手指ランドマーク
// 3. ランドマークの幾何判定でグー/チョキ/パーに分類
//
// 前処理・デコードは OpenCV Zoo のリファレンス実装
// (mp_palmdet.py / mp_handpose.py)に合わせている。
use ndarray::Array4;
use serde::Serialize;
use std::time::Instant;

use super::geometry::{
    apply_affine, dist, invert_affine, letterbox, nms, rotation_matrix, warp_affine, DetBox, RgbBuf,
};
use super::runtime::{elapsed_ms, load_session, run_single_input, ModelSession};

const PALM_INPUT_SIZE: usize = 192;
const PALM_SCORE_THRESHOLD: f32 = 0.6;
const PALM_NMS_THRESHOLD: f32 = 0.3;

const HAND_INPUT_SIZE: usize = 224;
/// 21点ランドマークの確信度閾値(mp_handpose.py デフォルトは 0.8)
const HAND_CONF_THRESHOLD: f32 = 0.8;

// mp_handpose.py の切り出しパラメータ
const PALM_BOX_PRE_ENLARGE: f32 = 4.0;
const PALM_BOX_SHIFT_Y: f32 = -0.4;
const PALM_BOX_ENLARGE: f32 = 3.0;

/// 指が「伸びている」と判定する距離比のマージン。
/// 手首から指先までの距離が、手首からPIP関節(親指はIP関節の代わりに
/// 小指の付け根を基準にした比較)より十分遠ければ伸展とみなす。
const FINGER_EXTENDED_RATIO: f32 = 1.1;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
pub enum Gesture {
    Rock,
    Scissors,
    Paper,
    /// 親指を立てる(確認カードの「はい」などに使える。現状ステータスには割り当てない)
    ThumbsUp,
    /// 親指を下に向ける(確認カードの「ちがう」)
    ThumbsDown,
    Unknown,
}

/// サムズアップ/ダウンの上下判定マージン(手のサイズ比)。
/// 親指の先が手首からこの比率以上 上/下 に離れているときだけ判定する。
const THUMB_DIRECTION_MARGIN: f32 = 0.25;

pub struct HandResult {
    pub gesture: Gesture,
    pub confidence: f32,
    /// 手のひら検出 bbox(元フレーム座標)
    pub palm_bbox: [f32; 4],
    /// 21点手ランドマーク(元フレーム座標)。オーバーレイ描画用。
    pub points_frame: Vec<[f32; 2]>,
}

pub struct GestureEngine {
    palm: ModelSession,
    handpose: ModelSession,
    /// SSDアンカー中心([0,1] 正規化座標)。2016個。
    anchors: Vec<[f32; 2]>,
}

/// mp_palmdet.py にハードコードされているアンカーと同一の生成則:
/// stride 8 (24x24グリッド, セルあたり2アンカー) → stride 16 (12x12, 6アンカー)。
/// 中心は ((col + 0.5) * stride / 192, (row + 0.5) * stride / 192)。
fn generate_palm_anchors() -> Vec<[f32; 2]> {
    let mut anchors = Vec::with_capacity(2016);
    for (stride, per_cell) in [(8usize, 2usize), (16, 6)] {
        let grid = PALM_INPUT_SIZE / stride;
        for row in 0..grid {
            for col in 0..grid {
                let cx = (col as f32 + 0.5) * stride as f32 / PALM_INPUT_SIZE as f32;
                let cy = (row as f32 + 0.5) * stride as f32 / PALM_INPUT_SIZE as f32;
                for _ in 0..per_cell {
                    anchors.push([cx, cy]);
                }
            }
        }
    }
    anchors
}

impl GestureEngine {
    pub fn load(paths: &super::paths::ModelPaths) -> Result<Self, String> {
        Ok(Self {
            palm: load_session("palm-detection", &paths.palm_detection)?,
            handpose: load_session("handpose", &paths.handpose)?,
            anchors: generate_palm_anchors(),
        })
    }

    /// 手のひら検出。戻り値の bbox / kps(7点)は元フレーム座標。
    fn detect_palms(&mut self, frame: &RgbBuf) -> Result<Vec<DetBox>, String> {
        let started = Instant::now();
        // mp_palmdet.py: アスペクト比維持 + 中央パディング + /255 + NHWC
        let lb = letterbox(frame, PALM_INPUT_SIZE, true);
        let mut input = Array4::<f32>::zeros((1, PALM_INPUT_SIZE, PALM_INPUT_SIZE, 3));
        for y in 0..PALM_INPUT_SIZE {
            for x in 0..PALM_INPUT_SIZE {
                let i = (y * PALM_INPUT_SIZE + x) * 3;
                for c in 0..3 {
                    input[[0, y, x, c]] = lb.image.data[i + c] as f32 / 255.0;
                }
            }
        }

        let outputs = run_single_input(&mut self.palm, input.into_dyn())?;
        // 出力は「bbox+7点デルタ(…x18)」と「スコア(…x1)」の2つ。
        // 順序に依存しないよう最終次元のサイズで判別する。
        let mut deltas = None;
        let mut scores = None;
        for out in &outputs {
            match out.shape().last() {
                Some(18) => deltas = Some(out),
                Some(1) => scores = Some(out),
                _ => {}
            }
        }
        let (deltas, scores) = match (deltas, scores) {
            (Some(d), Some(s)) => (d, s),
            _ => return Err("palm detection の出力形状が想定外です".to_string()),
        };
        let count = self.anchors.len();
        let deltas = deltas
            .view()
            .into_shape_with_order((count, 18))
            .map_err(|e| e.to_string())?;
        let scores = scores
            .view()
            .into_shape_with_order((count,))
            .map_err(|e| e.to_string())?;

        // mp_palmdet.py の _postprocess 相当。
        // scale = max(元画像の幅, 高さ)、pad_bias は元画像座標系に換算した値。
        let scale = frame.width.max(frame.height) as f32;
        let pad_bias = [
            (lb.pad_left / lb.scale).floor(),
            (lb.pad_top / lb.scale).floor(),
        ];

        let mut candidates = Vec::new();
        let input_f = PALM_INPUT_SIZE as f32;
        for i in 0..count {
            let score = super::geometry::sigmoid(scores[i]);
            if score < PALM_SCORE_THRESHOLD {
                continue;
            }
            let anchor = self.anchors[i];
            let cx = deltas[[i, 0]] / input_f;
            let cy = deltas[[i, 1]] / input_f;
            let w = deltas[[i, 2]] / input_f;
            let h = deltas[[i, 3]] / input_f;
            let bbox = [
                (cx - w / 2.0 + anchor[0]) * scale - pad_bias[0],
                (cy - h / 2.0 + anchor[1]) * scale - pad_bias[1],
                (cx + w / 2.0 + anchor[0]) * scale - pad_bias[0],
                (cy + h / 2.0 + anchor[1]) * scale - pad_bias[1],
            ];
            let mut kps = Vec::with_capacity(7);
            for k in 0..7 {
                kps.push([
                    (deltas[[i, 4 + k * 2]] / input_f + anchor[0]) * scale - pad_bias[0],
                    (deltas[[i, 5 + k * 2]] / input_f + anchor[1]) * scale - pad_bias[1],
                ]);
            }
            candidates.push(DetBox { bbox, score, kps });
        }

        let kept = nms(candidates, PALM_NMS_THRESHOLD);
        if cfg!(debug_assertions) {
            eprintln!(
                "[vision] 手のひら検出: {}ms ({}件)",
                elapsed_ms(started),
                kept.len()
            );
        }
        Ok(kept)
    }

    /// mp_handpose.py の前処理(切り出し→回転補正→再切り出し)を経て
    /// 21点ランドマークを推定し、ジェスチャーに分類する。
    /// 分類は回転補正後のクロップ座標系で完結するため、元座標への
    /// 逆変換は行わない(距離比ベースの判定は座標系に依存しない)。
    fn estimate_hand(
        &mut self,
        frame: &RgbBuf,
        palm: &DetBox,
    ) -> Result<Option<HandResult>, String> {
        let started = Instant::now();

        // モデル出力が壊れている場合は座標演算へ進まない。特に NaN を
        // warp_affine まで渡すと、無効な手を認識結果として扱う可能性がある。
        if palm.kps.len() < 3
            || palm
                .kps
                .iter()
                .flatten()
                .any(|coordinate| !coordinate.is_finite())
        {
            return Ok(None);
        }

        // --- 1. 手のひら周辺を大きめ(×4)に切り出し、回転しても欠けないよう
        //        対角線長の正方形にパディング(_cropAndPadFromPalm for_rotation=True)
        let Some((crop1, bbox1, bias1)) =
            crop_and_pad(frame, &bbox_of(palm), 0.0, PALM_BOX_PRE_ENLARGE, true)
        else {
            return Ok(None);
        };

        // 切り出し後座標系での手のひらランドマーク
        let palm_kps: Vec<[f32; 2]> = palm
            .kps
            .iter()
            .map(|p| [p[0] - bias1[0], p[1] - bias1[1]])
            .collect();

        // --- 2. 手首(kps[0])→中指付け根(kps[2])が真上を向くよう回転補正
        let p1 = palm_kps[0];
        let p2 = palm_kps[2];
        let mut radians = std::f32::consts::FRAC_PI_2 - (-(p2[1] - p1[1])).atan2(p2[0] - p1[0]);
        radians -= 2.0
            * std::f32::consts::PI
            * ((radians + std::f32::consts::PI) / (2.0 * std::f32::consts::PI)).floor();
        let angle_deg = radians.to_degrees();

        let bbox1_shifted = [
            bbox1[0] - bias1[0],
            bbox1[1] - bias1[1],
            bbox1[2] - bias1[0],
            bbox1[3] - bias1[1],
        ];
        let center = (
            (bbox1_shifted[0] + bbox1_shifted[2]) / 2.0,
            (bbox1_shifted[1] + bbox1_shifted[3]) / 2.0,
        );
        let rot = rotation_matrix(center, angle_deg, 1.0);
        let rotated = warp_affine(&crop1, &rot, crop1.width, crop1.height);

        // 回転後の手のひらランドマークの外接矩形
        let mut min_x = f32::MAX;
        let mut min_y = f32::MAX;
        let mut max_x = f32::MIN;
        let mut max_y = f32::MIN;
        for p in &palm_kps {
            let (x, y) = apply_affine(&rot, p[0], p[1]);
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }

        // --- 3. 上方向へシフト(-0.4)しつつ×3に広げて再切り出し
        let Some((crop2, _bbox2, bias2)) = crop_and_pad(
            &rotated,
            &[min_x, min_y, max_x, max_y],
            PALM_BOX_SHIFT_Y,
            PALM_BOX_ENLARGE,
            false,
        ) else {
            return Ok(None);
        };

        // 224x224 へ縮小し /255 + NHWC
        let scale = HAND_INPUT_SIZE as f32 / crop2.width.max(crop2.height).max(1) as f32;
        let m = [[scale, 0.0, 0.0], [0.0, scale, 0.0]];
        let resized = warp_affine(&crop2, &m, HAND_INPUT_SIZE, HAND_INPUT_SIZE);
        let mut input = Array4::<f32>::zeros((1, HAND_INPUT_SIZE, HAND_INPUT_SIZE, 3));
        for y in 0..HAND_INPUT_SIZE {
            for x in 0..HAND_INPUT_SIZE {
                let i = (y * HAND_INPUT_SIZE + x) * 3;
                for c in 0..3 {
                    input[[0, y, x, c]] = resized.data[i + c] as f32 / 255.0;
                }
            }
        }

        let outputs = run_single_input(&mut self.handpose, input.into_dyn())?;
        // 出力: [landmarks(63), conf(1), handedness(1), world_landmarks(63)] の順
        // (mp_handpose.py と同じ並び)。conf と handedness はどちらも長さ1の
        // ため、並び順に依存して最初の長さ1出力を conf とみなす。
        let mut landmarks: Option<Vec<f32>> = None;
        let mut conf: Option<f32> = None;
        for out in &outputs {
            let len = out.len();
            if len == 63 && landmarks.is_none() {
                landmarks = Some(out.iter().copied().collect());
            } else if len == 1 && conf.is_none() {
                conf = Some(*out.iter().next().unwrap());
            }
        }
        let (landmarks, conf) = match (landmarks, conf) {
            (Some(l), Some(c)) => (l, c),
            _ => return Err("handpose の出力形状が想定外です".to_string()),
        };

        if cfg!(debug_assertions) {
            eprintln!(
                "[vision] 21点ランドマーク: {}ms (conf={:.2})",
                elapsed_ms(started),
                conf
            );
        }
        if conf < HAND_CONF_THRESHOLD {
            return Ok(None);
        }

        // 21点 (x, y, z) → (x, y) のみ使用。この座標は 224x224 入力
        // (回転補正後クロップをリサイズしたもの)の座標系。
        let pts: Vec<[f32; 2]> = (0..21)
            .map(|i| [landmarks[i * 3], landmarks[i * 3 + 1]])
            .collect();

        // オーバーレイ描画用に元フレーム座標へ逆変換する。
        // 224入力 →(/scale)→ crop2 →(+bias2)→ rotated →(rot^-1)→ crop1
        //        →(+bias1)→ フレーム、の順に前処理を巻き戻す。
        let rot_inv = invert_affine(&rot);
        let points_frame: Vec<[f32; 2]> = pts
            .iter()
            .map(|p| {
                let cx = p[0] / scale + bias2[0];
                let cy = p[1] / scale + bias2[1];
                let (rx, ry) = apply_affine(&rot_inv, cx, cy);
                [rx + bias1[0], ry + bias1[1]]
            })
            .collect();

        Ok(Some(HandResult {
            // 形の判定は回転補正後のクロップ座標(回転不変)、サムズアップ/ダウンの
            // 上下判定は元フレーム座標(実世界の向き)を使う
            gesture: classify_gesture(&pts, &points_frame),
            confidence: conf,
            palm_bbox: palm.bbox,
            points_frame,
        }))
    }

    /// フレーム全体からジェスチャーを1つ判定する(最もスコアの高い手を採用)。
    pub fn detect(&mut self, frame: &RgbBuf) -> Result<Option<HandResult>, String> {
        let palms = self.detect_palms(frame)?;
        let Some(best) = palms.first() else {
            return Ok(None);
        };
        self.estimate_hand(frame, best)
    }
}

fn bbox_of(det: &DetBox) -> [f32; 4] {
    det.bbox
}

/// mp_handpose.py の _cropAndPadFromPalm 相当。
/// bbox を y方向に shift_y×高さ だけずらし、enlarge 倍に広げて切り出し、
/// 正方形(pad_to_diagonal なら対角線長、そうでなければ長辺)に
/// 中央パディングする。戻り値は (画像, 広げた後のbbox(クリップ済み・元座標),
/// 切り出し画像座標→元座標のオフセット)。bbox が無効、または
/// 画像と実際に交差しない場合は None を返す。
fn crop_and_pad(
    src: &RgbBuf,
    bbox: &[f32; 4],
    shift_y: f32,
    enlarge: f32,
    pad_to_diagonal: bool,
) -> Option<(RgbBuf, [f32; 4], [f32; 2])> {
    let expected_len = src.width.checked_mul(src.height)?.checked_mul(3)?;
    if src.width == 0
        || src.height == 0
        || src.data.len() != expected_len
        || !shift_y.is_finite()
        || !enlarge.is_finite()
        || enlarge <= 0.0
        || bbox.iter().any(|coordinate| !coordinate.is_finite())
    {
        return None;
    }

    let w = bbox[2] - bbox[0];
    let h = bbox[3] - bbox[1];
    if !w.is_finite() || !h.is_finite() || w <= 0.0 || h <= 0.0 {
        return None;
    }

    let shifted = [
        bbox[0],
        bbox[1] + shift_y * h,
        bbox[2],
        bbox[3] + shift_y * h,
    ];
    let cx = (shifted[0] + shifted[2]) / 2.0;
    let cy = (shifted[1] + shifted[3]) / 2.0;
    let half_w = w * enlarge / 2.0;
    let half_h = h * enlarge / 2.0;
    let crop_bounds = [cx - half_w, cy - half_h, cx + half_w, cy + half_h];
    if crop_bounds.iter().any(|coordinate| !coordinate.is_finite()) {
        return None;
    }

    // 整数化してから画像範囲にクリップ(リファレンス実装と同じ順序)
    let max_x = i64::try_from(src.width).ok()?;
    let max_y = i64::try_from(src.height).ok()?;
    let x1 = (crop_bounds[0] as i64).clamp(0, max_x) as usize;
    let y1 = (crop_bounds[1] as i64).clamp(0, max_y) as usize;
    let x2 = (crop_bounds[2] as i64).clamp(0, max_x) as usize;
    let y2 = (crop_bounds[3] as i64).clamp(0, max_y) as usize;
    // max(1) で存在しない1pxを作ると、完全に画像外の bbox で以下の
    // copy_from_slice が範囲外パニックする。実際の交差が無ければ推論対象外にする。
    if x2 <= x1 || y2 <= y1 {
        return None;
    }
    let crop_w = x2 - x1;
    let crop_h = y2 - y1;

    let side = if pad_to_diagonal {
        let squared = crop_w
            .checked_mul(crop_w)?
            .checked_add(crop_h.checked_mul(crop_h)?)?;
        (squared as f32).sqrt() as usize
    } else {
        crop_w.max(crop_h)
    }
    .max(crop_w)
    .max(crop_h);
    let pad_left = (side - crop_w) / 2;
    let pad_top = (side - crop_h) / 2;

    let output_len = side.checked_mul(side)?.checked_mul(3)?;
    let mut out = RgbBuf {
        width: side,
        height: side,
        data: vec![0; output_len].into(),
    };
    let row_len = crop_w.checked_mul(3)?;
    for y in 0..crop_h {
        let src_row = (y1 + y)
            .checked_mul(src.width)?
            .checked_add(x1)?
            .checked_mul(3)?;
        let dst_row = (pad_top + y)
            .checked_mul(side)?
            .checked_add(pad_left)?
            .checked_mul(3)?;
        let src_slice = src.data.get(src_row..src_row.checked_add(row_len)?)?;
        let dst_slice = out.data.get_mut(dst_row..dst_row.checked_add(row_len)?)?;
        dst_slice.copy_from_slice(src_slice);
    }

    let bias = [x1 as f32 - pad_left as f32, y1 as f32 - pad_top as f32];
    Some((out, [x1 as f32, y1 as f32, x2 as f32, y2 as f32], bias))
}

/// 21点ランドマークからジェスチャーを判定する。
///
/// 形の判定(pts: 回転補正後クロップ座標):
/// 各指(人差し指〜小指)は「手首から指先までの距離」が「手首からPIP関節
/// までの距離」より十分長ければ伸展とみなす(回転・スケール不変)。
/// 親指は折り畳むと指先が小指の付け根(17)に近づく性質を使い、
/// MP関節(2)との距離比で判定する。
///
/// - グー           : 5指すべて曲がっている
/// - チョキ         : 人差し指・中指のみ伸びている
/// - パー           : 5指すべて伸びている
/// - サムズアップ/ダウン: 親指のみ伸びている。上下の向きは回転補正の影響を
///   受けない元フレーム座標(pts_frame: y は画像下向き)で、親指の先が手首より
///   手のサイズ比で十分 上/下 にあるかで決める
/// - それ以外は Unknown
fn classify_gesture(pts: &[[f32; 2]], pts_frame: &[[f32; 2]]) -> Gesture {
    let wrist = pts[0];
    // (PIP, TIP) のランドマークインデックス: 人差し指・中指・薬指・小指
    let fingers = [(6usize, 8usize), (10, 12), (14, 16), (18, 20)];
    let extended: Vec<bool> = fingers
        .iter()
        .map(|&(pip, tip)| dist(pts[tip], wrist) > dist(pts[pip], wrist) * FINGER_EXTENDED_RATIO)
        .collect();

    let pinky_mcp = pts[17];
    let thumb_extended = dist(pts[4], pinky_mcp) > dist(pts[2], pinky_mcp) * FINGER_EXTENDED_RATIO;

    let extended_count = extended.iter().filter(|&&e| e).count();
    if extended_count == 0 && !thumb_extended {
        Gesture::Rock
    } else if extended_count == 4 && thumb_extended {
        Gesture::Paper
    } else if extended[0] && extended[1] && !extended[2] && !extended[3] && !thumb_extended {
        Gesture::Scissors
    } else if extended_count == 0 && thumb_extended && pts_frame.len() >= 21 {
        // 親指のみ伸展 → 実世界の向きでサムズアップ/ダウンを判定
        let hand_size = dist(pts_frame[0], pts_frame[9]).max(1e-3);
        let dy = pts_frame[4][1] - pts_frame[0][1]; // y は画像下向き
        if dy < -hand_size * THUMB_DIRECTION_MARGIN {
            Gesture::ThumbsUp
        } else if dy > hand_size * THUMB_DIRECTION_MARGIN {
            Gesture::ThumbsDown
        } else {
            Gesture::Unknown
        }
    } else {
        Gesture::Unknown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 上向きの手を模した簡易座標でルールベース分類を検証する。
    // 手首(0)を原点、指はy負方向(上)に伸びる。
    fn base_hand() -> Vec<[f32; 2]> {
        let mut pts = vec![[0.0f32, 0.0]; 21];
        pts[0] = [0.0, 0.0]; // wrist
                             // 親指: MCP(2)=(-30,-30), IP(3), TIP(4) は伸展時さらに外側へ
        pts[1] = [-15.0, -15.0];
        pts[2] = [-30.0, -30.0];
        pts[3] = [-45.0, -40.0];
        pts[4] = [-60.0, -50.0];
        // 各指: MCP, PIP, DIP, TIP (伸展状態)
        let xs = [-15.0f32, 0.0, 15.0, 30.0]; // 人差し指〜小指のx位置
        for (f, &x) in xs.iter().enumerate() {
            let mcp = 5 + f * 4;
            pts[mcp] = [x, -60.0];
            pts[mcp + 1] = [x, -80.0];
            pts[mcp + 2] = [x, -100.0];
            pts[mcp + 3] = [x, -120.0];
        }
        pts[17] = [30.0, -60.0]; // 小指MCP(上のループで設定済みだが明示)
        pts
    }

    fn curl_finger(pts: &mut [[f32; 2]], finger: usize) {
        // 指先を手のひら側(PIPより手首寄り)へ折り畳む
        let mcp = 5 + finger * 4;
        let x = pts[mcp][0];
        pts[mcp + 1] = [x, -70.0];
        pts[mcp + 2] = [x, -55.0];
        pts[mcp + 3] = [x, -40.0];
    }

    fn curl_thumb(pts: &mut [[f32; 2]]) {
        // 親指先を小指の付け根方向へ
        pts[3] = [-10.0, -40.0];
        pts[4] = [10.0, -50.0];
    }

    #[test]
    fn classifies_paper() {
        let pts = base_hand();
        assert_eq!(classify_gesture(&pts, &pts), Gesture::Paper);
    }

    #[test]
    fn classifies_rock() {
        let mut pts = base_hand();
        for f in 0..4 {
            curl_finger(&mut pts, f);
        }
        curl_thumb(&mut pts);
        assert_eq!(classify_gesture(&pts, &pts), Gesture::Rock);
    }

    #[test]
    fn classifies_scissors() {
        let mut pts = base_hand();
        curl_finger(&mut pts, 2); // 薬指
        curl_finger(&mut pts, 3); // 小指
        curl_thumb(&mut pts);
        assert_eq!(classify_gesture(&pts, &pts), Gesture::Scissors);
    }

    #[test]
    fn ambiguous_is_unknown() {
        let mut pts = base_hand();
        curl_finger(&mut pts, 0); // 人差し指だけ曲げる(=中指〜小指伸展)
        assert_eq!(classify_gesture(&pts, &pts), Gesture::Unknown);
    }

    // 親指のみ伸展の手(サムズアップ/ダウンの形)。base_hand から4指を曲げ、
    // 親指は伸ばしたまま(base_hand の親指は伸展状態)。
    fn thumbs_hand() -> Vec<[f32; 2]> {
        let mut pts = base_hand();
        for f in 0..4 {
            curl_finger(&mut pts, f);
        }
        pts
    }

    #[test]
    fn classifies_thumbs_up() {
        let pts = thumbs_hand();
        // フレーム座標: 親指の先(4)が手首(0)より上(y が小さい)= base_hand のまま
        assert_eq!(classify_gesture(&pts, &pts), Gesture::ThumbsUp);
    }

    #[test]
    fn classifies_thumbs_down() {
        let pts = thumbs_hand();
        // フレーム座標だけ上下反転(手を下に向けた状態)にする
        let frame: Vec<[f32; 2]> = pts.iter().map(|p| [p[0], -p[1]]).collect();
        assert_eq!(classify_gesture(&pts, &frame), Gesture::ThumbsDown);
    }

    #[test]
    fn anchors_match_reference_layout() {
        let anchors = generate_palm_anchors();
        assert_eq!(anchors.len(), 2016);
        // mp_palmdet.py のハードコード値の先頭・境界・末尾と一致すること
        assert!((anchors[0][0] - 0.02083333).abs() < 1e-6);
        assert!((anchors[0][1] - 0.02083333).abs() < 1e-6);
        assert!((anchors[2][0] - 0.0625).abs() < 1e-6);
        assert!((anchors[1152][0] - 0.04166666).abs() < 1e-6); // stride16 先頭
        assert!((anchors[2015][0] - 0.9583333).abs() < 1e-6);
        assert!((anchors[2015][1] - 0.9583333).abs() < 1e-6);
    }

    #[test]
    fn crop_rejects_invalid_or_non_intersecting_bbox() {
        let frame = RgbBuf::new(8, 6);

        for bbox in [
            [10.0, 1.0, 12.0, 3.0],
            [-12.0, 1.0, -10.0, 3.0],
            [1.0, 1.0, 1.0, 3.0],
            [f32::NAN, 1.0, 3.0, 3.0],
        ] {
            assert!(crop_and_pad(&frame, &bbox, 0.0, 1.0, false).is_none());
        }
    }

    #[test]
    fn crop_keeps_valid_intersection_at_frame_edge() {
        let frame = RgbBuf::new(8, 6);
        let (crop, clipped, _) = crop_and_pad(&frame, &[-2.0, 1.0, 3.0, 5.0], 0.0, 1.0, false)
            .expect("画像と交差する bbox は切り出せるべきです");

        assert_eq!(clipped, [0.0, 1.0, 3.0, 5.0]);
        assert_eq!((crop.width, crop.height), (4, 4));
        assert_eq!(crop.data.len(), 4 * 4 * 3);
    }
}
