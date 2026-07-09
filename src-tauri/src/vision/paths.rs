// モデルファイルのパス解決。パスのハードコードが散らばらないよう、
// モデルの配置規約(ディレクトリ構成・ファイル名)はこのモジュールに集約する。
use std::path::{Path, PathBuf};

/// `src-tauri/resources/` 以下のモデル格納ディレクトリ(規約)。
/// - buffalo_l: InsightFace buffalo_l パッケージのうち使用する3モデル
/// - gesture:   OpenCV Zoo 経由の MediaPipe 変換モデル
const MODELS_SUBDIR: &str = "resources/models";
/// ONNX Runtime 共有ライブラリ(load-dynamic 用)の配置場所(規約)
const ONNXRUNTIME_SUBDIR: &str = "resources/onnxruntime";
const ONNXRUNTIME_LIB: &str = "libonnxruntime.so";
const FACE_DET_MODEL: &str = "buffalo_l/det_10g.onnx";
const FACE_LANDMARK_MODEL: &str = "buffalo_l/2d106det.onnx";
const FACE_RECOGNITION_MODEL: &str = "buffalo_l/w600k_r50.onnx";
const PALM_DETECTION_MODEL: &str = "gesture/palm_detection_mediapipe_2023feb.onnx";
const HANDPOSE_MODEL: &str = "gesture/handpose_estimation_mediapipe_2023feb.onnx";

pub struct ModelPaths {
    pub face_det: PathBuf,
    pub face_landmark: PathBuf,
    pub face_recognition: PathBuf,
    pub palm_detection: PathBuf,
    pub handpose: PathBuf,
}

impl ModelPaths {
    fn from_models_dir(dir: &Path) -> Self {
        Self {
            face_det: dir.join(FACE_DET_MODEL),
            face_landmark: dir.join(FACE_LANDMARK_MODEL),
            face_recognition: dir.join(FACE_RECOGNITION_MODEL),
            palm_detection: dir.join(PALM_DETECTION_MODEL),
            handpose: dir.join(HANDPOSE_MODEL),
        }
    }

    fn all(&self) -> [&PathBuf; 5] {
        [
            &self.face_det,
            &self.face_landmark,
            &self.face_recognition,
            &self.palm_detection,
            &self.handpose,
        ]
    }

    /// モデルディレクトリの候補から、5モデル全てが存在する最初のものを使う。
    /// 1. Tauri のリソースディレクトリ(deb インストール後 / tauri build 時)
    /// 2. ソースツリーの src-tauri/resources/models(cargo での開発時・テスト時)
    pub fn resolve(resource_dir: Option<PathBuf>) -> Result<Self, String> {
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Some(dir) = resource_dir {
            candidates.push(dir.join(MODELS_SUBDIR));
        }
        candidates.push(
            Path::new(env!("CARGO_MANIFEST_DIR")).join(MODELS_SUBDIR),
        );

        for dir in &candidates {
            let paths = Self::from_models_dir(dir);
            if paths.all().iter().all(|p| p.exists()) {
                return Ok(paths);
            }
        }

        Err(format!(
            "モデルファイルが見つかりません。.devcontainer/setup-models.sh を実行してモデルを取得してください(探索先: {})",
            candidates
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ))
    }
}

/// ONNX Runtime 共有ライブラリ(libonnxruntime.so)のパスを解決する。
/// 探索順はモデルと同じ(リソースディレクトリ → ソースツリー)。
pub fn resolve_onnxruntime_lib(resource_dir: Option<PathBuf>) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(dir) = resource_dir {
        candidates.push(dir.join(ONNXRUNTIME_SUBDIR).join(ONNXRUNTIME_LIB));
    }
    candidates.push(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(ONNXRUNTIME_SUBDIR)
            .join(ONNXRUNTIME_LIB),
    );

    candidates
        .iter()
        .find(|p| p.exists())
        .cloned()
        .ok_or_else(|| {
            format!(
                "libonnxruntime.so が見つかりません。.devcontainer/setup-models.sh を実行してください(探索先: {})",
                candidates
                    .iter()
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })
}
