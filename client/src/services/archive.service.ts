// client/src/services/archive.service.ts
import { apiClient } from "../api/apiClient";

export type CorrespondenceType = "INCOMING" | "OUTGOING" | "INTERNAL";
export type CorrespondencePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type CorrespondenceStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "REPLIED"
  | "ARCHIVED"
  | "CLOSED";

export interface ArchiveStats {
  totalDocuments: number;
  totalCategories: number;
  starredDocuments: number;
  incomingCount: number;
  outgoingCount: number;
  internalCount: number;
  unreadInboxCount: number;
}

export interface ArchiveCategoryItem {
  id: number;
  name: string;
  nameEn?: string | null;
  parentId?: number | null;
  code: string;
  isActive: boolean;
  parent?: { id: number; name: string; code: string } | null;
  _count?: { documents: number; children: number };
}

export interface ArchiveDocumentVersion {
  id: number;
  versionNumber: number;
  originalName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  sha256?: string | null;
  notes?: string | null;
  createdAt: string;
  createdBy?: { id: number; fullName: string; username: string } | null;
}

export interface ArchiveDocumentItem {
  id: number;
  documentNo: string;
  title: string;
  categoryId?: number | null;
  description?: string | null;
  date: string;
  storagePath?: string | null;
  originalName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  sha256?: string | null;
  isEncrypted: boolean;
  tags: string[];
  isStarred: boolean;
  createdAt: string;
  category?: { id: number; name: string; code: string } | null;
  createdBy?: { id: number; fullName: string; username: string } | null;
  versions?: ArchiveDocumentVersion[];
  _count?: { versions: number; correspondence: number };
}

export interface CorrespondenceRoutingItem {
  id: number;
  correspondenceId: number;
  fromUserId: number;
  toUserId: number;
  instructions?: string | null;
  sentAt: string;
  readAt?: string | null;
  actionTaken?: string | null;
  notes?: string | null;
  fromUser?: { id: number; fullName: string; username: string } | null;
  toUser?: { id: number; fullName: string; username: string } | null;
  correspondence?: CorrespondenceItem;
}

export interface CorrespondenceItem {
  id: number;
  correspondenceNo: string;
  type: CorrespondenceType;
  date: string;
  subject: string;
  senderName?: string | null;
  senderOrg?: string | null;
  receiverName?: string | null;
  receiverOrg?: string | null;
  referenceNo?: string | null;
  priority: CorrespondencePriority;
  status: CorrespondenceStatus;
  notes?: string | null;
  documentId?: number | null;
  document?: {
    id: number;
    documentNo: string;
    title: string;
    mimeType?: string | null;
    originalName?: string | null;
  } | null;
  createdBy?: { id: number; fullName: string; username: string } | null;
  routing?: CorrespondenceRoutingItem[];
}

export interface RoutableUserItem {
  id: number;
  fullName: string;
  username: string;
  jobRank?: string | null;
  department?: { id: number; name: string } | null;
}

export const archiveService = {
  getStats: async (): Promise<ArchiveStats> =>
    (await apiClient.get<ArchiveStats>("/archive/stats")).data,

  // Categories
  getCategories: async (): Promise<ArchiveCategoryItem[]> =>
    (await apiClient.get<ArchiveCategoryItem[]>("/archive/categories")).data,

  createCategory: async (payload: {
    name: string;
    nameEn?: string;
    parentId?: number;
    code?: string;
  }) => (await apiClient.post("/archive/categories", payload)).data,

  updateCategory: async (
    id: number,
    payload: {
      name?: string;
      nameEn?: string;
      parentId?: number | null;
      isActive?: boolean;
    },
  ) => (await apiClient.patch(`/archive/categories/${id}`, payload)).data,

  deleteCategory: async (id: number) =>
    (await apiClient.delete(`/archive/categories/${id}`)).data,

  // Documents
  findAllDocuments: async (params?: {
    categoryId?: number;
    isStarred?: string;
    tag?: string;
    search?: string;
  }): Promise<ArchiveDocumentItem[]> =>
    (await apiClient.get<ArchiveDocumentItem[]>("/archive/documents", { params }))
      .data,

  getDocument: async (id: number): Promise<ArchiveDocumentItem> =>
    (await apiClient.get<ArchiveDocumentItem>(`/archive/documents/${id}`)).data,

  createDocument: async (formData: FormData): Promise<ArchiveDocumentItem> =>
    (
      await apiClient.post<ArchiveDocumentItem>("/archive/documents", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ).data,

  toggleStar: async (id: number) =>
    (await apiClient.patch(`/archive/documents/${id}/star`)).data,

  addVersion: async (id: number, formData: FormData) =>
    (
      await apiClient.post(`/archive/documents/${id}/versions`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ).data,

  downloadDocumentBlob: async (id: number, inline = false): Promise<Blob> =>
    (
      await apiClient.get(`/archive/documents/${id}/download`, {
        params: inline ? { inline: "1" } : undefined,
        responseType: "blob",
      })
    ).data,

  downloadVersionBlob: async (
    docId: number,
    versionId: number,
    inline = false,
  ): Promise<Blob> =>
    (
      await apiClient.get(
        `/archive/documents/${docId}/versions/${versionId}/download`,
        {
          params: inline ? { inline: "1" } : undefined,
          responseType: "blob",
        },
      )
    ).data,

  deleteDocument: async (id: number) =>
    (await apiClient.delete(`/archive/documents/${id}`)).data,

  // Correspondence & Routing
  findAllCorrespondence: async (params?: {
    type?: string;
    status?: string;
    priority?: string;
    search?: string;
  }): Promise<CorrespondenceItem[]> =>
    (
      await apiClient.get<CorrespondenceItem[]>("/archive/correspondence", {
        params,
      })
    ).data,

  createCorrespondence: async (payload: Record<string, unknown>) =>
    (await apiClient.post("/archive/correspondence", payload)).data,

  updateCorrespondence: async (id: number, payload: Record<string, unknown>) =>
    (await apiClient.patch(`/archive/correspondence/${id}`, payload)).data,

  deleteCorrespondence: async (id: number) =>
    (await apiClient.delete(`/archive/correspondence/${id}`)).data,

  routeCorrespondence: async (
    id: number,
    payload: { toUserId: number; instructions?: string; notes?: string },
  ) => (await apiClient.post(`/archive/correspondence/${id}/route`, payload)).data,

  getInbox: async (unreadOnly = false): Promise<CorrespondenceRoutingItem[]> =>
    (
      await apiClient.get<CorrespondenceRoutingItem[]>(
        "/archive/correspondence/routing/inbox",
        { params: unreadOnly ? { unreadOnly: "true" } : undefined },
      )
    ).data,

  acknowledgeRouting: async (
    routingId: number,
    payload: {
      actionTaken?: string;
      notes?: string;
      updateCorrespondenceStatus?: CorrespondenceStatus;
    },
  ) =>
    (
      await apiClient.patch(
        `/archive/correspondence/routing/${routingId}/acknowledge`,
        payload,
      )
    ).data,

  listRoutableUsers: async (): Promise<RoutableUserItem[]> =>
    (
      await apiClient.get<RoutableUserItem[]>(
        "/archive/correspondence/routing/users",
      )
    ).data,
};
