/**
 * User Hooks
 *
 * Section 6: TanStack Query for Server State
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastT } from "@/lib/toast-i18n";
import { queryKeys } from "@/lib/query-client";
import * as userApi from "../api/user.api";
import type { UpdateUserRequest } from "../api/user.api";

// ============================================
// QUERIES
// ============================================

export function useUserMe() {
  return useQuery({
    queryKey: queryKeys.users.me(),
    queryFn: () => userApi.getUserMe(),
  });
}

// ============================================
// MUTATIONS
// ============================================

export function useUpdateUserMe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserRequest) => userApi.updateUserMe(data),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(queryKeys.users.me(), updatedUser);
      toast.success(toastT("toast.profile.updated"));
    },
    onError: () => {
      toast.error(toastT("toast.profile.updateFailed"));
    },
  });
}
