import { useTranslation } from "react-i18next";
// client/src/pages/settings/SpecialtiesPage.tsx

import { useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Specialty = {
  id: number;
  name: string;
  code: string | null;
  isActive: boolean;
  _count?: { doctors: number };
};

export default function SpecialtiesPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
      )}
    </div>
  );
}
