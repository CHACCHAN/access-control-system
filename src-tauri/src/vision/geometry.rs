// 推論パイプライン共通の画像・幾何ユーティリティ。
// OpenCV 相当の処理(warpAffine / getRotationMatrix2D / NMS / 相似変換推定)を
// 依存を増やさず最小限で実装している。座標系は全て「x右・y下」のピクセル座標。

/// 生RGBバッファ(len = width * height * 3)。カメラキャプチャの生フレームと
/// 推論用の中間画像はすべてこの形式で受け渡す。
#[derive(Clone)]
pub struct RgbBuf {
    pub width: usize,
    pub height: usize,
    pub data: Vec<u8>,
}

impl RgbBuf {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            data: vec![0; width * height * 3],
        }
    }

    #[inline]
    fn pixel(&self, x: usize, y: usize) -> [u8; 3] {
        let i = (y * self.width + x) * 3;
        [self.data[i], self.data[i + 1], self.data[i + 2]]
    }

    /// バイリニア補間でサンプリングする。範囲外は黒(cv2.warpAffine の
    /// borderValue=0 相当)。
    #[inline]
    fn sample_bilinear(&self, x: f32, y: f32) -> [f32; 3] {
        if x < 0.0 || y < 0.0 || x > (self.width - 1) as f32 || y > (self.height - 1) as f32 {
            return [0.0; 3];
        }
        let x0 = x.floor() as usize;
        let y0 = y.floor() as usize;
        let x1 = (x0 + 1).min(self.width - 1);
        let y1 = (y0 + 1).min(self.height - 1);
        let fx = x - x0 as f32;
        let fy = y - y0 as f32;

        let p00 = self.pixel(x0, y0);
        let p10 = self.pixel(x1, y0);
        let p01 = self.pixel(x0, y1);
        let p11 = self.pixel(x1, y1);

        let mut out = [0.0f32; 3];
        for c in 0..3 {
            let top = p00[c] as f32 * (1.0 - fx) + p10[c] as f32 * fx;
            let bottom = p01[c] as f32 * (1.0 - fx) + p11[c] as f32 * fx;
            out[c] = top * (1.0 - fy) + bottom * fy;
        }
        out
    }
}

/// 2x3 アフィン変換行列(row-major)。dst = M * [x, y, 1]^T
pub type Affine = [[f32; 3]; 2];

#[inline]
pub fn apply_affine(m: &Affine, x: f32, y: f32) -> (f32, f32) {
    (
        m[0][0] * x + m[0][1] * y + m[0][2],
        m[1][0] * x + m[1][1] * y + m[1][2],
    )
}

/// アフィン変換の逆行列(cv2.invertAffineTransform 相当)
pub fn invert_affine(m: &Affine) -> Affine {
    let det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
    let inv_det = if det.abs() < 1e-12 { 0.0 } else { 1.0 / det };
    let a = m[1][1] * inv_det;
    let b = -m[0][1] * inv_det;
    let c = -m[1][0] * inv_det;
    let d = m[0][0] * inv_det;
    [
        [a, b, -(a * m[0][2] + b * m[1][2])],
        [c, d, -(c * m[0][2] + d * m[1][2])],
    ]
}

/// cv2.getRotationMatrix2D 相当。angle_deg は反時計回り(度)、center 周りの回転。
pub fn rotation_matrix(center: (f32, f32), angle_deg: f32, scale: f32) -> Affine {
    let angle = angle_deg.to_radians();
    let alpha = scale * angle.cos();
    let beta = scale * angle.sin();
    let (cx, cy) = center;
    [
        [alpha, beta, (1.0 - alpha) * cx - beta * cy],
        [-beta, alpha, beta * cx + (1.0 - alpha) * cy],
    ]
}

/// cv2.warpAffine 相当。m は src→dst の順変換で、内部で逆変換して
/// dst 側の各ピクセルをバイリニアサンプリングで埋める。
pub fn warp_affine(src: &RgbBuf, m: &Affine, out_width: usize, out_height: usize) -> RgbBuf {
    let inv = invert_affine(m);
    let mut dst = RgbBuf::new(out_width, out_height);
    for y in 0..out_height {
        for x in 0..out_width {
            let (sx, sy) = apply_affine(&inv, x as f32, y as f32);
            let rgb = src.sample_bilinear(sx, sy);
            let i = (y * out_width + x) * 3;
            dst.data[i] = rgb[0] as u8;
            dst.data[i + 1] = rgb[1] as u8;
            dst.data[i + 2] = rgb[2] as u8;
        }
    }
    dst
}

/// アスペクト比を保って縮小し、余白を黒でパディングして正方形 size x size に
/// 収める。`center_pad` が false なら左上詰め(insightface SCRFD 方式)、
/// true なら中央寄せ(OpenCV Zoo の palm detection 方式)。
/// 戻り値は (画像, 元画像座標への係数 scale, パディング量 (left, top))。
/// 元座標への復元は (x_pad - left) / scale。
pub struct Letterboxed {
    pub image: RgbBuf,
    pub scale: f32,
    pub pad_left: f32,
    pub pad_top: f32,
}

pub fn letterbox(src: &RgbBuf, size: usize, center_pad: bool) -> Letterboxed {
    let scale = (size as f32 / src.width as f32).min(size as f32 / src.height as f32);
    let new_w = ((src.width as f32 * scale) as usize).max(1);
    let new_h = ((src.height as f32 * scale) as usize).max(1);
    let (pad_left, pad_top) = if center_pad {
        (((size - new_w) / 2) as f32, ((size - new_h) / 2) as f32)
    } else {
        (0.0, 0.0)
    };
    // scale倍縮小 + (pad_left, pad_top) 平行移動のアフィンとして一括処理する
    let m: Affine = [[scale, 0.0, pad_left], [0.0, scale, pad_top]];
    Letterboxed {
        image: warp_affine(src, &m, size, size),
        scale,
        pad_left,
        pad_top,
    }
}

/// 5点対応から相似変換(回転+等方スケール+平行移動)を最小二乗で推定する。
/// skimage.transform.SimilarityTransform.estimate(反転なし)相当の閉形式解。
pub fn estimate_similarity(src: &[[f32; 2]], dst: &[[f32; 2]]) -> Affine {
    let n = src.len() as f32;
    let (mut mx_s, mut my_s, mut mx_d, mut my_d) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
    for (s, d) in src.iter().zip(dst) {
        mx_s += s[0];
        my_s += s[1];
        mx_d += d[0];
        my_d += d[1];
    }
    mx_s /= n;
    my_s /= n;
    mx_d /= n;
    my_d /= n;

    // 中心化した座標で a = Σ(ps・pd)/Σ|ps|^2, b = Σ(ps×pd)/Σ|ps|^2 を解く。
    // 変換は [ [a, -b], [b, a] ] (回転+スケール)。
    let (mut num_a, mut num_b, mut den) = (0.0f32, 0.0f32, 0.0f32);
    for (s, d) in src.iter().zip(dst) {
        let sx = s[0] - mx_s;
        let sy = s[1] - my_s;
        let dx = d[0] - mx_d;
        let dy = d[1] - my_d;
        num_a += sx * dx + sy * dy;
        num_b += sx * dy - sy * dx;
        den += sx * sx + sy * sy;
    }
    if den.abs() < 1e-12 {
        return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]];
    }
    let a = num_a / den;
    let b = num_b / den;
    [
        [a, -b, mx_d - a * mx_s + b * my_s],
        [b, a, my_d - b * mx_s - a * my_s],
    ]
}

#[derive(Clone, Debug)]
pub struct DetBox {
    /// [x1, y1, x2, y2]
    pub bbox: [f32; 4],
    pub score: f32,
    /// キーポイント(顔=5点, 手のひら=7点)。[x, y] の並び。
    pub kps: Vec<[f32; 2]>,
}

fn iou(a: &[f32; 4], b: &[f32; 4]) -> f32 {
    let x1 = a[0].max(b[0]);
    let y1 = a[1].max(b[1]);
    let x2 = a[2].min(b[2]);
    let y2 = a[3].min(b[3]);
    let inter = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let area_a = (a[2] - a[0]).max(0.0) * (a[3] - a[1]).max(0.0);
    let area_b = (b[2] - b[0]).max(0.0) * (b[3] - b[1]).max(0.0);
    let union = area_a + area_b - inter;
    if union <= 0.0 {
        0.0
    } else {
        inter / union
    }
}

/// スコア降順の greedy NMS。残った検出をスコア降順で返す。
pub fn nms(mut dets: Vec<DetBox>, iou_threshold: f32) -> Vec<DetBox> {
    dets.sort_by(|a, b| b.score.total_cmp(&a.score));
    let mut kept: Vec<DetBox> = Vec::new();
    for det in dets {
        if kept.iter().all(|k| iou(&k.bbox, &det.bbox) < iou_threshold) {
            kept.push(det);
        }
    }
    kept
}

#[inline]
pub fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

#[inline]
pub fn dist(a: [f32; 2], b: [f32; 2]) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}
