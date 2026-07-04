import { useState } from "react";

export interface EnrolledFace {
  username: string;
  descriptor: Float32Array;
}

interface UseEnrolledFacesResult {
  enrolledFaces: EnrolledFace[];
  enroll: (username: string, descriptor: Float32Array) => void;
}

/**
 * 登録済みメンバーの顔特徴ベクトルを React state 上で保持する簡易フック。
 * リロードすると消えるデモ用実装で、本番は顔登録APIの結果をここに反映する想定。
 */
export function useEnrolledFaces(): UseEnrolledFacesResult {
  const [enrolledFaces, setEnrolledFaces] = useState<EnrolledFace[]>([]);

  function enroll(username: string, descriptor: Float32Array) {
    setEnrolledFaces((prev) => [
      ...prev.filter((f) => f.username !== username),
      { username, descriptor },
    ]);
  }

  return { enrolledFaces, enroll };
}
