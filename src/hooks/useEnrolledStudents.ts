import { useState } from "react";

export interface EnrolledStudent {
  studentNumber: string;
  descriptor: Float32Array;
}

interface UseEnrolledStudentsResult {
  students: EnrolledStudent[];
  enroll: (studentNumber: string, descriptor: Float32Array) => void;
}

/**
 * 登録済み学生の学籍番号と特徴ベクトルを、ブラウザのメモリ上(React state)で
 * 管理する簡易フック。
 *
 * これはあくまでデモ・ロジック検証用であり、リロードすると消える。
 * 本番運用時はここを PostgreSQL(pgvector) への読み書きに置き換える想定。
 */
export function useEnrolledStudents(): UseEnrolledStudentsResult {
  const [students, setStudents] = useState<EnrolledStudent[]>([]);

  function enroll(studentNumber: string, descriptor: Float32Array) {
    setStudents((prev) => {
      // 同じ学籍番号が既にあれば上書き、無ければ追加
      const withoutExisting = prev.filter(
        (s) => s.studentNumber !== studentNumber,
      );
      return [...withoutExisting, { studentNumber, descriptor }];
    });
  }

  return { students, enroll };
}
