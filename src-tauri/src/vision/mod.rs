// 顔認証・ジェスチャー認識の推論基盤(全てRust側で完結させる)。
//
// フロントエンドはカメラ映像の表示と「推論中」の表示のみを担い、
// このモジュールの Tauri command が返す結果(JSON)だけを使う。
// フレームはカメラキャプチャスレッドが共有する最新フレーム
// (camera_capture::SharedFrame)から取得するため、フロントから
// 画像を受け渡す必要はない。
mod face;
mod geometry;
mod gesture;
mod overlay;
mod paths;
mod runtime;

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;

use crate::camera_capture::SharedFrame;
use face::{align_kps_from_106, FaceEngine};
use geometry::RgbBuf;
use gesture::{Gesture, GestureEngine};
pub use overlay::OverlayState;
use overlay::{FaceOverlay, HandOverlay};

// 照合閾値・マージン・最小顔サイズ比率は設定(settings.json の performance)で
// 調整できる。既定値は crate::settings::PerfSettings::default() を参照。

/// キャプチャがこの時間より古いフレームしか持っていない場合は
/// 「カメラ映像なし」として扱う(カメラ停止後の残像で推論しない)。
const FRAME_STALE_MS: u128 = 3_000;

/// ジェスチャー→在室ステータスのマッピング設定。
/// フロントエンドの設定(tauri-plugin-store の settings.json 内
/// `settings.gestureStatusMap`)として永続化され、Rust 側はそれを参照する。
use crate::settings::{SETTINGS_KEY, SETTINGS_STORE_FILE};
const GESTURE_MAP_KEY: &str = "gestureStatusMap";

/// デフォルトのマッピング(フロント側 DEFAULT_SETTINGS と揃えること)
const DEFAULT_ROCK_STATUS: &str = "在室";
const DEFAULT_SCISSORS_STATUS: &str = "外出";
const DEFAULT_PAPER_STATUS: &str = "帰宅";

#[derive(Clone)]
pub struct EnrolledFace {
    pub username: String,
    /// 正規化済み 512次元 embedding
    pub embedding: Vec<f32>,
}

#[derive(Default)]
struct VisionInner {
    face: Mutex<Option<FaceEngine>>,
    gesture: Mutex<Option<GestureEngine>>,
    enrolled: RwLock<Vec<EnrolledFace>>,
}

#[derive(Clone, Default)]
pub struct VisionState(Arc<VisionInner>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaceAuthResult {
    pub face_detected: bool,
    /// 検出した顔の [x, y, width, height](フレーム座標)。オーバーレイ描画用。
    pub bbox: Option<[f32; 4]>,
    pub det_score: f32,
    pub frame_width: u32,
    pub frame_height: u32,
    pub recognized: bool,
    pub user_id: Option<String>,
    pub confidence: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaceEmbeddingResult {
    pub embedding: Vec<f32>,
    pub det_score: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GestureResult {
    pub hand_detected: bool,
    /// "Rock" | "Scissors" | "Paper" | "Unknown"
    pub gesture: String,
    pub confidence: f32,
    /// gestureStatusMap を適用した在室ステータス(未割り当てなら None)
    pub room_status: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrolledFaceInput {
    pub username: String,
    pub embedding: Vec<f32>,
}

impl VisionState {
    /// モデルを(未ロードなら)ロードする。二重ロードはしない。
    fn ensure_loaded(&self, app: &AppHandle) -> Result<(), String> {
        let paths_needed = {
            let face = self.0.face.lock().map_err(|_| "内部状態のロックに失敗しました")?;
            let gesture = self.0.gesture.lock().map_err(|_| "内部状態のロックに失敗しました")?;
            face.is_none() || gesture.is_none()
        };
        if !paths_needed {
            return Ok(());
        }

        let started = Instant::now();
        let resource_dir = app.path().resource_dir().ok();
        runtime::init_onnxruntime(&paths::resolve_onnxruntime_lib(resource_dir.clone())?)?;
        let paths = paths::ModelPaths::resolve(resource_dir)?;

        {
            let mut face = self.0.face.lock().map_err(|_| "内部状態のロックに失敗しました")?;
            if face.is_none() {
                *face = Some(FaceEngine::load(&paths)?);
            }
        }
        {
            let mut gesture = self.0.gesture.lock().map_err(|_| "内部状態のロックに失敗しました")?;
            if gesture.is_none() {
                *gesture = Some(GestureEngine::load(&paths)?);
            }
        }
        eprintln!(
            "[vision] 全モデルのロード完了: {}ms",
            started.elapsed().as_millis()
        );
        Ok(())
    }
}

/// 共有フレームから推論用の RgbBuf を取り出す。
fn latest_frame(shared: &SharedFrame) -> Result<RgbBuf, String> {
    let guard = shared
        .0
        .lock()
        .map_err(|_| "フレーム共有状態のロックに失敗しました")?;
    let frame = guard
        .as_ref()
        .ok_or("カメラフレームがまだ届いていません。カメラキャプチャが動作しているか確認してください")?;
    if frame.captured_at.elapsed().as_millis() > FRAME_STALE_MS {
        return Err("カメラフレームが古すぎます(キャプチャが停止している可能性があります)".to_string());
    }
    Ok(RgbBuf {
        width: frame.width as usize,
        height: frame.height as usize,
        data: frame.rgb.clone(),
    })
}

/// 起動時(ブートチェック)にモデルをロードして推論基盤を初期化する。
/// 重い処理のためブロッキングスレッドで実行する。
#[tauri::command]
pub async fn init_vision(app: AppHandle, state: State<'_, VisionState>) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.ensure_loaded(&app))
        .await
        .map_err(|e| format!("推論基盤の初期化タスクが失敗しました: {e}"))?
}

/// 登録済み顔 embedding の一覧を差し替える(メンバー一覧の取得・顔登録の
/// たびにフロントから同期される)。512次元以外は無視して件数を返す。
#[tauri::command]
pub fn set_enrolled_faces(
    state: State<'_, VisionState>,
    faces: Vec<EnrolledFaceInput>,
) -> Result<usize, String> {
    let mut valid = Vec::with_capacity(faces.len());
    for face in faces {
        if face.embedding.len() != 512 {
            // faceapi.js 時代の128次元ベクトルが残っているメンバーは照合対象外
            eprintln!(
                "[vision] {} の embedding は {}次元のため照合対象外(512次元のみ対応)",
                face.username,
                face.embedding.len()
            );
            continue;
        }
        let norm = face
            .embedding
            .iter()
            .map(|v| v * v)
            .sum::<f32>()
            .sqrt()
            .max(1e-12);
        valid.push(EnrolledFace {
            username: face.username,
            embedding: face.embedding.iter().map(|v| v / norm).collect(),
        });
    }
    let count = valid.len();
    *state
        .0
        .enrolled
        .write()
        .map_err(|_| "内部状態のロックに失敗しました")? = valid;
    eprintln!("[vision] 登録済み顔を更新: {count}件");
    Ok(count)
}

/// 最新のカメラフレームに対して顔検出→(登録があれば)1:N照合を行う。
#[tauri::command]
pub async fn recognize_face(
    app: AppHandle,
    state: State<'_, VisionState>,
    frame_state: State<'_, SharedFrame>,
    overlay_state: State<'_, OverlayState>,
) -> Result<FaceAuthResult, String> {
    let state = state.inner().clone();
    let shared = frame_state.inner().clone();
    let overlay = overlay_state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        state.ensure_loaded(&app)?;
        let perf = crate::settings::load_perf(&app);
        let frame = latest_frame(&shared)?;
        let total_started = Instant::now();

        let mut engine_guard = state
            .0
            .face
            .lock()
            .map_err(|_| "内部状態のロックに失敗しました")?;
        let engine = engine_guard.as_mut().ok_or("顔認証モデルが未ロードです")?;

        let mut result = FaceAuthResult {
            face_detected: false,
            bbox: None,
            det_score: 0.0,
            frame_width: frame.width as u32,
            frame_height: frame.height as u32,
            recognized: false,
            user_id: None,
            confidence: 0.0,
        };

        let detections = engine.detect(&frame)?;
        // best の借用をここで終わらせ、以降 engine を可変で使えるようにする
        let Some((best_bbox, best_kps, best_score)) =
            detections.first().map(|d| (d.bbox, d.kps, d.score))
        else {
            // 顔が消えたらオーバーレイも消す
            overlay.clear_face();
            return Ok(result);
        };
        result.face_detected = true;
        result.det_score = best_score;
        result.bbox = Some([
            best_bbox[0],
            best_bbox[1],
            best_bbox[2] - best_bbox[0],
            best_bbox[3] - best_bbox[1],
        ]);

        // オーバーレイ描画用の106点ランドマーク(照合の有無に関わらず常に取得)。
        // これはアライメント用の5点導出にも再利用する。
        let landmarks = engine.landmarks_106(&frame, &best_bbox)?.unwrap_or_default();

        // 顔が小さすぎる(遠い)うちは高コストな照合はしない
        let face_width_ratio = (best_bbox[2] - best_bbox[0]) / frame.width as f32;
        if face_width_ratio >= perf.min_face_width_ratio {
            let enrolled = state
                .0
                .enrolled
                .read()
                .map_err(|_| "内部状態のロックに失敗しました")?
                .clone();
            if !enrolled.is_empty() {
                // 106点からアライメント5点を導出(失敗時は SCRFD の5点)
                let kps = align_kps_from_106(&landmarks, &best_bbox).unwrap_or(best_kps);
                let embedding = engine.embed(&frame, &kps)?;

                // 1:N 照合(全件コサイン類似度)
                let mut best_match: Option<(&EnrolledFace, f32)> = None;
                let mut second_score = f32::MIN;
                for face in &enrolled {
                    let score = face::cosine_similarity(&embedding, &face.embedding);
                    match &best_match {
                        Some((_, top)) if score <= *top => {
                            if score > second_score {
                                second_score = score;
                            }
                        }
                        _ => {
                            if let Some((_, top)) = &best_match {
                                second_score = *top;
                            }
                            best_match = Some((face, score));
                        }
                    }
                }

                if let Some((face, score)) = best_match {
                    result.confidence = score;
                    let ambiguous =
                        enrolled.len() > 1 && (score - second_score) < perf.match_margin;
                    if score >= perf.match_threshold && !ambiguous {
                        result.recognized = true;
                        result.user_id = Some(face.username.clone());
                    }
                    eprintln!(
                        "[vision] 照合: best={} score={:.3} second={:.3} recognized={}",
                        face.username, score, second_score, result.recognized
                    );
                }
            }
        }

        // 検出結果をオーバーレイ状態へ(カメラキャプチャがフレームへ焼き込む)
        overlay.set_face(FaceOverlay {
            bbox: best_bbox,
            landmarks,
            recognized: result.recognized,
        });

        eprintln!(
            "[vision] 顔認証パイプライン合計: {}ms",
            total_started.elapsed().as_millis()
        );
        Ok(result)
    })
    .await
    .map_err(|e| format!("顔認証タスクが失敗しました: {e}"))?
}

/// 顔登録用: 最新フレームから embedding を1件抽出する。
/// 顔が検出できない・小さすぎる場合はエラーを返す。
#[tauri::command]
pub async fn capture_face_embedding(
    app: AppHandle,
    state: State<'_, VisionState>,
    frame_state: State<'_, SharedFrame>,
) -> Result<FaceEmbeddingResult, String> {
    let state = state.inner().clone();
    let shared = frame_state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        state.ensure_loaded(&app)?;
        let perf = crate::settings::load_perf(&app);
        let frame = latest_frame(&shared)?;

        let mut engine_guard = state
            .0
            .face
            .lock()
            .map_err(|_| "内部状態のロックに失敗しました")?;
        let engine = engine_guard.as_mut().ok_or("顔認証モデルが未ロードです")?;

        let detections = engine.detect(&frame)?;
        let best = detections
            .first()
            .ok_or("顔が検出できませんでした。カメラに正面を向けてください")?;

        let face_width_ratio = (best.bbox[2] - best.bbox[0]) / frame.width as f32;
        if face_width_ratio < perf.min_face_width_ratio {
            return Err("顔が小さすぎます。もう少しカメラに近づいてください".to_string());
        }

        let kps = engine
            .refine_keypoints(&frame, &best.bbox)?
            .unwrap_or(best.kps);
        let embedding = engine.embed(&frame, &kps)?;
        Ok(FaceEmbeddingResult {
            embedding,
            det_score: best.score,
        })
    })
    .await
    .map_err(|e| format!("顔登録タスクが失敗しました: {e}"))?
}

/// 設定ストアからジェスチャー→在室ステータスのマッピングを読む。
fn gesture_status(app: &AppHandle, gesture: Gesture) -> Option<String> {
    let key = match gesture {
        Gesture::Rock => "rock",
        Gesture::Scissors => "scissors",
        Gesture::Paper => "paper",
        // サムズアップ/ダウンは確認カードの はい/ちがう 用で、在室ステータスには割り当てない
        Gesture::ThumbsUp | Gesture::ThumbsDown | Gesture::Unknown => return None,
    };
    let default = match gesture {
        Gesture::Rock => DEFAULT_ROCK_STATUS,
        Gesture::Scissors => DEFAULT_SCISSORS_STATUS,
        Gesture::Paper => DEFAULT_PAPER_STATUS,
        _ => unreachable!(),
    };

    let configured = app
        .store(SETTINGS_STORE_FILE)
        .ok()
        .and_then(|store| store.get(SETTINGS_KEY))
        .and_then(|settings| {
            settings
                .get(GESTURE_MAP_KEY)
                .and_then(|map| map.get(key))
                .and_then(|v| v.as_str().map(str::to_string))
        });

    match configured {
        // 空文字は「割り当てなし」
        Some(s) if s.is_empty() => None,
        Some(s) => Some(s),
        None => Some(default.to_string()),
    }
}

/// 最新のカメラフレームからジェスチャー(グー/チョキ/パー)を判定し、
/// 設定に従って在室ステータスへマッピングして返す。
#[tauri::command]
pub async fn detect_gesture(
    app: AppHandle,
    state: State<'_, VisionState>,
    frame_state: State<'_, SharedFrame>,
    overlay_state: State<'_, OverlayState>,
) -> Result<GestureResult, String> {
    let state = state.inner().clone();
    let shared = frame_state.inner().clone();
    let overlay = overlay_state.inner().clone();
    let app_for_map = app.clone();

    let (hand, total_ms) = tauri::async_runtime::spawn_blocking(move || {
        state.ensure_loaded(&app)?;
        let frame = latest_frame(&shared)?;
        let started = Instant::now();

        let mut engine_guard = state
            .0
            .gesture
            .lock()
            .map_err(|_| "内部状態のロックに失敗しました")?;
        let engine = engine_guard
            .as_mut()
            .ok_or("ジェスチャー認識モデルが未ロードです")?;
        let hand = engine.detect(&frame)?;
        Ok::<_, String>((hand, started.elapsed().as_millis()))
    })
    .await
    .map_err(|e| format!("ジェスチャー認識タスクが失敗しました: {e}"))??;

    eprintln!("[vision] ジェスチャー認識パイプライン合計: {total_ms}ms");

    let Some(hand) = hand else {
        // 手が消えたらオーバーレイも消す
        overlay.clear_hand();
        return Ok(GestureResult {
            hand_detected: false,
            gesture: "Unknown".to_string(),
            confidence: 0.0,
            room_status: None,
        });
    };

    // 手の骨格をオーバーレイ状態へ(カメラキャプチャがフレームへ焼き込む)
    overlay.set_hand(HandOverlay {
        bbox: hand.palm_bbox,
        points: hand.points_frame.clone(),
    });

    Ok(GestureResult {
        hand_detected: true,
        gesture: format!("{:?}", hand.gesture),
        confidence: hand.confidence,
        room_status: gesture_status(&app_for_map, hand.gesture),
    })
}

// ---- 消灯中の人感復帰ウォッチャー ----
//
// ディスプレイを DPMS で物理消灯すると、X の描画クロック停止に伴って
// WebView(WebKitGTK)側のタイマー処理が間引き・停止されることがあり、
// フロント(JS)主導のポーリングでは復帰できない場合がある。
// そのため消灯中の顔検出は WebView に依存しない Rust 専用スレッドで行い、
// 検出したら Rust 自身が画面を点灯してからフロントへイベントで通知する。

/// 顔がフレーム幅のこの比率以上の大きさで写ったら「人が近づいた」とみなす
const WAKE_FACE_WIDTH_RATIO: f32 = 0.10;
/// 消灯中の顔検出ポーリング間隔
const WAKE_POLL_INTERVAL: Duration = Duration::from_millis(1500);
/// 人感復帰時にフロントへ送るイベント名
const WAKE_EVENT: &str = "display-woken";

#[derive(Clone, Default)]
pub struct WakeWatchState(Arc<AtomicBool>);

/// 人感復帰の監視を開始する(消灯開始時にフロントから呼ぶ)。
/// 既に監視中なら何もしない。人を検出すると画面を点灯し、`display-woken`
/// イベントを emit して自動的に監視を終了する。
#[tauri::command]
pub fn start_wake_watch(
    app: AppHandle,
    state: State<'_, VisionState>,
    frame_state: State<'_, SharedFrame>,
    watch: State<'_, WakeWatchState>,
) -> Result<(), String> {
    if watch.0.swap(true, Ordering::SeqCst) {
        return Ok(()); // 既に監視中
    }
    let flag = watch.0.clone();
    let state = state.inner().clone();
    let shared = frame_state.inner().clone();

    std::thread::spawn(move || {
        eprintln!("[wake-watch] 人感復帰の監視を開始");
        while flag.load(Ordering::SeqCst) {
            std::thread::sleep(WAKE_POLL_INTERVAL);
            if !flag.load(Ordering::SeqCst) {
                break;
            }
            if state.ensure_loaded(&app).is_err() {
                continue;
            }
            // 検出とロックはこのブロック内で完結させ、sleep 中はロックを持たない
            let ratio = {
                let Ok(frame) = latest_frame(&shared) else {
                    continue;
                };
                let Ok(mut guard) = state.0.face.lock() else {
                    continue;
                };
                let Some(engine) = guard.as_mut() else {
                    continue;
                };
                let Ok(detections) = engine.detect(&frame) else {
                    continue;
                };
                let Some(best) = detections.first() else {
                    continue;
                };
                (best.bbox[2] - best.bbox[0]) / frame.width as f32
            };

            eprintln!(
                "[wake-watch] 消灯中に顔検出: ratio={ratio:.2} (復帰しきい値 {WAKE_FACE_WIDTH_RATIO})"
            );
            if ratio >= WAKE_FACE_WIDTH_RATIO {
                crate::display_force_on();
                let _ = app.emit(WAKE_EVENT, ());
                flag.store(false, Ordering::SeqCst);
                eprintln!("[wake-watch] 人を検出 → 画面を点灯しました");
                break;
            }
        }
        eprintln!("[wake-watch] 監視を終了");
    });
    Ok(())
}

/// 人感復帰の監視を停止する(操作による復帰などで消灯が解除されたとき)。
#[tauri::command]
pub fn stop_wake_watch(watch: State<'_, WakeWatchState>) {
    watch.0.store(false, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_test_image(path: &str) -> RgbBuf {
        let img = image::open(path).expect("テスト画像を読み込めません").to_rgb8();
        RgbBuf {
            width: img.width() as usize,
            height: img.height() as usize,
            data: img.into_raw(),
        }
    }

    fn model_paths() -> paths::ModelPaths {
        runtime::init_onnxruntime(
            &paths::resolve_onnxruntime_lib(None)
                .expect("libonnxruntime.so が未配置です(setup-models.sh を実行してください)"),
        )
        .expect("ONNX Runtime の初期化に失敗");
        paths::ModelPaths::resolve(None).expect("モデルが未配置です(setup-models.sh を実行してください)")
    }

    /// 顔が写っていない画像では顔が検出されないこと、およびパイプラインが
    /// クラッシュしないこと。画像(リポジトリ直下の image.jpg)が無い環境では
    /// スキップ扱い(他の *_TEST_IMAGE 系テストと同じ方針)。
    #[test]
    fn face_pipeline_rejects_non_face_image() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../image.jpg");
        if !std::path::Path::new(path).exists() {
            eprintln!("image.jpg が無いためスキップ");
            return;
        }
        let frame = load_test_image(path);
        let mut engine = FaceEngine::load(&model_paths()).expect("モデルロード失敗");
        let detections = engine.detect(&frame).expect("検出失敗");
        assert!(
            detections.is_empty(),
            "顔なし画像から誤検出しました: {}件",
            detections.len()
        );

        let mut gesture = GestureEngine::load(&model_paths()).expect("モデルロード失敗");
        let result = gesture.detect(&frame).expect("ジェスチャー推論失敗");
        assert!(result.is_none(), "顔なし画像から手を誤検出しました");
    }

    /// 実際の顔画像で検出→106点ランドマーク→embedding→照合の一貫検証。
    /// 顔画像は環境変数 FACE_TEST_IMAGE で指定する(複数人が写る画像を推奨。
    /// 例: insightface のテスト画像
    /// https://raw.githubusercontent.com/deepinsight/insightface/master/python-package/insightface/data/images/t1.jpg )。
    /// 未指定時はスキップ扱い(何も検証せず成功)にする。
    #[test]
    fn face_pipeline_on_real_face_image() {
        let Ok(path) = std::env::var("FACE_TEST_IMAGE") else {
            eprintln!("FACE_TEST_IMAGE 未指定のためスキップ");
            return;
        };
        let frame = load_test_image(&path);
        let mut engine = FaceEngine::load(&model_paths()).expect("モデルロード失敗");

        let detections = engine.detect(&frame).expect("検出失敗");
        assert!(!detections.is_empty(), "顔が検出できませんでした");
        eprintln!("検出数: {}", detections.len());
        let best = &detections[0];
        assert!(best.score > 0.5, "検出スコアが低すぎます: {}", best.score);

        let kps = engine
            .refine_keypoints(&frame, &best.bbox)
            .expect("ランドマーク推定失敗")
            .expect("106点ランドマークの妥当性チェックに失敗");
        // 106点由来の5点は SCRFD の5点と大きくずれないはず
        for (refined, det) in kps.iter().zip(&best.kps) {
            let face_size = (best.bbox[2] - best.bbox[0]).max(best.bbox[3] - best.bbox[1]);
            let d = geometry::dist(*refined, *det);
            assert!(
                d < face_size * 0.25,
                "106点由来の5点がSCRFDの5点から大きくずれています: {d}px (顔サイズ {face_size}px)"
            );
        }

        let embedding = engine.embed(&frame, &kps).expect("embedding抽出失敗");
        assert_eq!(embedding.len(), 512);
        let norm: f32 = embedding.iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-3, "embeddingが正規化されていません: {norm}");

        // 同一顔の再抽出 → ほぼ同一ベクトル
        let embedding2 = engine.embed(&frame, &kps).expect("embedding再抽出失敗");
        let self_sim = face::cosine_similarity(&embedding, &embedding2);
        assert!(self_sim > 0.999, "同一顔の類似度が低すぎます: {self_sim}");

        // 別人同士の類似度は照合閾値(0.5)を大きく下回るはず
        if detections.len() >= 2 {
            let other = &detections[1];
            let other_kps = engine
                .refine_keypoints(&frame, &other.bbox)
                .expect("ランドマーク推定失敗")
                .unwrap_or(other.kps);
            let other_embedding = engine.embed(&frame, &other_kps).expect("embedding抽出失敗");
            let cross_sim = face::cosine_similarity(&embedding, &other_embedding);
            eprintln!("別人間の類似度: {cross_sim:.3}");
            assert!(
                cross_sim < crate::settings::PerfSettings::default().match_threshold,
                "別人同士の類似度が閾値を超えています: {cross_sim}"
            );
        }
    }

    /// 実際の手画像でジェスチャー認識の一貫検証。
    /// 環境変数 HAND_TEST_IMAGE に「開いた手のひら(パー)」の画像を指定する。
    /// 未指定時はスキップ扱い。
    #[test]
    fn gesture_pipeline_on_real_hand_image() {
        let Ok(path) = std::env::var("HAND_TEST_IMAGE") else {
            eprintln!("HAND_TEST_IMAGE 未指定のためスキップ");
            return;
        };
        let frame = load_test_image(&path);
        let mut engine = GestureEngine::load(&model_paths()).expect("モデルロード失敗");
        let result = engine
            .detect(&frame)
            .expect("ジェスチャー推論失敗")
            .expect("手が検出できませんでした");
        eprintln!("gesture={:?} conf={:.3}", result.gesture, result.confidence);
        assert_eq!(result.gesture, Gesture::Paper, "開いた手のひらがパーと判定されません");
    }
}
