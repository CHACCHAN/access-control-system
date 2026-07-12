// Rust(Tauri backend)側の推論コマンド(顔認証・ジェスチャー認識)の型付き
// ラッパー。検出・認識処理は全てRust側で完結し、フロントは結果のJSONだけを
// 受け取る。開発時・本番時を問わず常に実際の推論APIを叩く(モックなし)。
import { invoke } from "@tauri-apps/api/core";

export interface FaceAuthResult {
  faceDetected: boolean;
  /** 検出した顔の [x, y, width, height](カメラフレーム座標) */
  bbox: [number, number, number, number] | null;
  detScore: number;
  frameWidth: number;
  frameHeight: number;
  recognized: boolean;
  userId: string | null;
  confidence: number;
}

export interface FaceEmbeddingResult {
  /** ArcFace 512次元・正規化済み */
  embedding: number[];
  detScore: number;
}

export type GestureKind =
  | "Rock"
  | "Scissors"
  | "Paper"
  | "ThumbsUp"
  | "ThumbsDown"
  | "Unknown";

export interface GestureResult {
  handDetected: boolean;
  gesture: GestureKind;
  confidence: number;
  /** ジェスチャー→在室ステータス設定を適用した結果(未割り当て・サムズ系は null) */
  roomStatus: string | null;
}

export interface EnrolledFaceInput {
  username: string;
  embedding: number[];
}

export interface FaceRecognitionOptions {
  /** falseなら顔検出だけを行い、ArcFace embeddingと1:N照合を省略する。 */
  matchFaces: boolean;
  /** 検出専用時にも106点ランドマークを描画するか。 */
  includeLandmarks: boolean;
  /** この顔幅比率未満では、フロントが結果を使わないため照合を省略する。 */
  minMatchFaceWidthRatio: number;
}

/** 推論基盤(ONNX Runtime + 5モデル)を初期化する。冪等。 */
export function initVision(): Promise<void> {
  return invoke("init_vision");
}

/** 顔認証モデルだけを初期化する(ジェスチャーモデル障害から分離)。 */
export function initFaceVision(): Promise<void> {
  return invoke("init_face_vision");
}

/**
 * 照合対象の登録済み embedding 一覧をRust側に同期する。
 * 512次元以外(faceapi.js時代の128次元など)はRust側で照合対象外になる。
 * 戻り値は照合対象として受理された件数。
 */
export function setEnrolledFaces(faces: EnrolledFaceInput[]): Promise<number> {
  return invoke("set_enrolled_faces", { faces });
}

/** 最新のカメラフレームに対する顔検出。必要な画面だけ1:N照合まで行う。 */
export function recognizeFace(options: FaceRecognitionOptions): Promise<FaceAuthResult> {
  return invoke("recognize_face", { ...options });
}

/** 顔登録用: 最新フレームから embedding を1件抽出(顔なし等はエラー) */
export function captureFaceEmbedding(): Promise<FaceEmbeddingResult> {
  return invoke("capture_face_embedding");
}

/** 最新のカメラフレームに対するジェスチャー判定 */
export function detectGesture(): Promise<GestureResult> {
  return invoke("detect_gesture");
}
