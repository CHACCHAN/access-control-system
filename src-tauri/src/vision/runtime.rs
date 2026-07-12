// ONNX Runtime (ort) のセッション生成・実行の共通処理。
// モデルごとの前処理・デコードは face.rs / gesture.rs 側にあり、
// ここでは「ロード」「単一入力での実行」「処理時間計測」だけを担う。
use ndarray::ArrayD;
use std::path::Path;
use std::sync::OnceLock;
use std::time::Instant;

use ort::session::Session;

/// 実行ごとに変わらない入出力名をセッションと一緒に保持する。
pub struct ModelSession {
    inner: Session,
    input_name: String,
    output_names: Vec<String>,
}

/// 推論スレッド数。i7-3770(4C8T)で WebKit UI と同居するため、
/// 物理コア数まででとどめる。
const INTRA_THREADS: usize = 4;

pub fn elapsed_ms(started: Instant) -> u128 {
    started.elapsed().as_millis()
}

static ORT_INIT: OnceLock<Result<(), String>> = OnceLock::new();

/// ONNX Runtime(load-dynamic)をプロセス全体で一度だけ初期化する。
/// `dylib_path` の libonnxruntime.so を dlopen してグローバル環境を作る。
pub fn init_onnxruntime(dylib_path: &Path) -> Result<(), String> {
    ORT_INIT
        .get_or_init(|| {
            let started = Instant::now();
            ort::init_from(dylib_path.to_string_lossy().as_ref())
                .map_err(|e| {
                    format!(
                        "ONNX Runtime の初期化に失敗しました ({}): {e}",
                        dylib_path.display()
                    )
                })?
                .commit();
            eprintln!(
                "[vision] ONNX Runtime 初期化: {}ms ({})",
                elapsed_ms(started),
                dylib_path.display()
            );
            Ok(())
        })
        .clone()
}

/// モデルをロードしてセッションを作る。ロード時間はログに残す
/// (w600k_r50 は 170MB 近くあり、起動時間の把握に必要)。
pub fn load_session(label: &str, path: &Path) -> Result<ModelSession, String> {
    let started = Instant::now();
    let session = (|| -> ort::Result<Session> {
        Session::builder()?
            .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)?
            .with_intra_threads(INTRA_THREADS)?
            .commit_from_file(path)
    })()
    .map_err(|e| {
        format!(
            "モデル {label} のロードに失敗しました ({}): {e}",
            path.display()
        )
    })?;
    let input_name = session
        .inputs()
        .first()
        .map(|input| input.name().to_string())
        .ok_or("モデルに入力がありません")?;
    let output_names = session
        .outputs()
        .iter()
        .map(|output| output.name().to_string())
        .collect();
    eprintln!(
        "[vision] モデルロード {label}: {}ms ({})",
        elapsed_ms(started),
        path.display()
    );
    Ok(ModelSession {
        inner: session,
        input_name,
        output_names,
    })
}

/// 入力が1つのモデルを実行し、全出力をモデル定義の順序で owned な
/// f32 配列として返す。
pub fn run_single_input(
    session: &mut ModelSession,
    input: ArrayD<f32>,
) -> Result<Vec<ArrayD<f32>>, String> {
    let ModelSession {
        inner,
        input_name,
        output_names,
    } = session;
    let tensor = ort::value::Tensor::from_array(input)
        .map_err(|e| format!("入力テンソル生成に失敗: {e}"))?;
    let outputs = inner
        .run(ort::inputs![input_name.as_str() => tensor])
        .map_err(|e| format!("推論の実行に失敗: {e}"))?;

    let mut results = Vec::with_capacity(output_names.len());
    for name in output_names.iter() {
        let array = outputs[name.as_str()]
            .try_extract_array::<f32>()
            .map_err(|e| format!("出力 {name} の取り出しに失敗: {e}"))?
            .to_owned();
        results.push(array);
    }
    Ok(results)
}
