import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { fetchMembers, type Member } from "./api";

interface UseMembersResult {
  members: Member[];
  setMembers: Dispatch<SetStateAction<Member[]>>;
  isLoading: boolean;
  error: string | null;
}

export function useMembers(): UseMembersResult {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMembers()
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { members, setMembers, isLoading, error };
}
