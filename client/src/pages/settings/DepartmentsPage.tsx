import { useTranslation } from "react-i18next";
// client/src/pages/settings/DepartmentsPage.tsx

import { useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Department = {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
  _count?: { users: number };
};

export default function DepartmentsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
        </div>
      )}
    </div>
  );
}
