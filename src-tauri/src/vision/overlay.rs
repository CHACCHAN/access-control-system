// 検出結果(顔枠・顔ランドマーク・手の骨格)をカメラフレームへ直接描画するための
// 共有状態。推論コマンド(recognize_face / detect_gesture)が最新結果を書き込み、
// カメラキャプチャスレッドが各フレームへ上書きしてから JPEG 化してフロントへ送る。
// フロント(React)はオーバーレイ済みのフレームを表示するだけでよい。
use std::sync::{Arc, Mutex};
use std::time::Instant;

use super::geometry::Canvas;

// 描画色(RGB)。アクセントに依らず視認性優先の固定色。
const COLOR_FACE: [u8; 3] = [56, 189, 248]; // 顔枠(未認識): cyan
const COLOR_FACE_MATCH: [u8; 3] = [52, 211, 153]; // 顔枠(認識成功): emerald
const COLOR_LANDMARK: [u8; 3] = [186, 230, 253]; // 顔ランドマーク点: 淡いcyan
const COLOR_HAND: [u8; 3] = [244, 114, 182]; // 手の枠・骨格: pink
const COLOR_HAND_POINT: [u8; 3] = [251, 191, 36]; // 手の関節点: amber

// この時間より古い結果は描かない(検出が途切れたら自然に消える)。
const FACE_TTL_MS: u128 = 1500;
const HAND_TTL_MS: u128 = 1200;

// MediaPipe 21点手ランドマークの接続(骨格線)
const HAND_CONNECTIONS: [(usize, usize); 21] = [
    (0, 1),
    (1, 2),
    (2, 3),
    (3, 4),
    (0, 5),
    (5, 6),
    (6, 7),
    (7, 8),
    (5, 9),
    (9, 10),
    (10, 11),
    (11, 12),
    (9, 13),
    (13, 14),
    (14, 15),
    (15, 16),
    (13, 17),
    (17, 18),
    (18, 19),
    (19, 20),
    (0, 17),
];

#[derive(Clone)]
pub struct FaceOverlay {
    /// 元フレーム座標の [x1, y1, x2, y2]
    pub bbox: [f32; 4],
    /// 106点ランドマーク(フレーム座標)。空なら点は描かない。
    pub landmarks: Vec<[f32; 2]>,
    /// 照合で本人特定できたか(枠色を変える)
    pub recognized: bool,
}

#[derive(Clone)]
pub struct HandOverlay {
    /// 手のひら検出 bbox(フレーム座標)
    pub bbox: [f32; 4],
    /// 21点手ランドマーク(フレーム座標)。21点未満なら骨格は描かない。
    pub points: Vec<[f32; 2]>,
}

#[derive(Default)]
struct OverlayInner {
    face: Option<(FaceOverlay, Instant)>,
    hand: Option<(HandOverlay, Instant)>,
}

/// Tauri の管理状態として共有するオーバーレイ。
#[derive(Clone, Default)]
pub struct OverlayState(Arc<Mutex<OverlayInner>>);

impl OverlayState {
    pub fn set_face(&self, face: FaceOverlay) {
        if let Ok(mut g) = self.0.lock() {
            g.face = Some((face, Instant::now()));
        }
    }

    pub fn clear_face(&self) {
        if let Ok(mut g) = self.0.lock() {
            g.face = None;
        }
    }

    pub fn set_hand(&self, hand: HandOverlay) {
        if let Ok(mut g) = self.0.lock() {
            g.hand = Some((hand, Instant::now()));
        }
    }

    pub fn clear_hand(&self) {
        if let Ok(mut g) = self.0.lock() {
            g.hand = None;
        }
    }

    /// 生RGBバッファへ最新の検出結果(有効期限内)を上書きする。
    pub fn render(&self, rgb: &mut [u8], width: usize, height: usize) {
        let (face, hand) = {
            let Ok(g) = self.0.lock() else {
                return;
            };
            let face = g
                .face
                .as_ref()
                .filter(|(_, t)| t.elapsed().as_millis() <= FACE_TTL_MS)
                .map(|(f, _)| f.clone());
            let hand = g
                .hand
                .as_ref()
                .filter(|(_, t)| t.elapsed().as_millis() <= HAND_TTL_MS)
                .map(|(h, _)| h.clone());
            (face, hand)
        };
        if face.is_none() && hand.is_none() {
            return;
        }

        let mut canvas = Canvas::new(rgb, width, height);

        if let Some(f) = face {
            let color = if f.recognized {
                COLOR_FACE_MATCH
            } else {
                COLOR_FACE
            };
            canvas.draw_rect(f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3], 2.0, color);
            for p in &f.landmarks {
                canvas.draw_disc(p[0], p[1], 1.3, COLOR_LANDMARK);
            }
        }

        if let Some(h) = hand {
            canvas.draw_rect(h.bbox[0], h.bbox[1], h.bbox[2], h.bbox[3], 2.0, COLOR_HAND);
            if h.points.len() >= 21 {
                for &(a, b) in &HAND_CONNECTIONS {
                    canvas.draw_line(h.points[a], h.points[b], 2.0, COLOR_HAND);
                }
                for p in &h.points {
                    canvas.draw_disc(p[0], p[1], 2.5, COLOR_HAND_POINT);
                }
            }
        }
    }
}
