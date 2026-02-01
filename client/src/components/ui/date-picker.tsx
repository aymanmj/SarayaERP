// src/components/ui/date-picker.tsx

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { ar } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  date?: Date;
  onChange?: (date: Date | undefined) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function DatePicker({
  date,
  onChange,
  className,
  placeholder = "YYYY/MM/DD",
  disabled = false,
}: DatePickerProps) {
  // حالة نصية للتحكم في القيمة المكتوبة يدوياً
  const [inputValue, setInputValue] = React.useState<string>(
    date ? format(date, "yyyy/MM/dd") : "",
  );

  // تحديث النص عند تغيير التاريخ من الخارج
  React.useEffect(() => {
    if (date) {
      setInputValue(format(date, "yyyy/MM/dd"));
    } else {
      setInputValue("");
    }
  }, [date]);

  // معالجة الكتابة اليدوية
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // محاولة تحليل التاريخ إذا كان مكتمل الطول
    if (value.length === 10) {
      const parsedDate = parse(value, "yyyy/MM/dd", new Date());
      if (isValid(parsedDate)) {
        onChange?.(parsedDate);
      }
    }
  };

  return (
    <Popover>
      <div className={cn("relative w-full", className)}>
        {/* أيقونة التقويم - عند الضغط عليها يفتح الـ Popover */}
        <PopoverTrigger asChild>
          <div className="absolute inset-y-0 start-0 flex items-center ps-3 cursor-pointer z-10 hover:text-sky-500 transition-colors">
            <CalendarIcon className="w-4 h-4 text-slate-400" />
          </div>
        </PopoverTrigger>

        {/* حقل الإدخال للكتابة اليدوية */}
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "block w-full ps-10 pe-3 py-2 bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 outline-none transition-all",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
        />
      </div>

      <PopoverContent
        className="w-auto p-0 bg-slate-950 border-slate-700 text-slate-100 shadow-2xl"
        align="start"
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={(selectedDate) => {
            onChange?.(selectedDate);
            if (selectedDate) setInputValue(format(selectedDate, "yyyy/MM/dd"));
          }}
          autoFocus
          locale={ar}
        />
      </PopoverContent>
    </Popover>
  );
}

// import * as React from "react";
// import { format } from "date-fns";
// import { Calendar as CalendarIcon } from "lucide-react";
// import { ar } from "date-fns/locale";

// import { cn } from "@/lib/utils";
// import { Button } from "@/components/ui/button";
// import { Calendar } from "@/components/ui/calendar";
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover";

// interface DatePickerProps {
//   date?: Date;
//   onChange?: (date: Date | undefined) => void;
//   className?: string;
//   placeholder?: string;
//   disabled?: boolean;
// }

// export function DatePicker({
//   date,
//   onChange,
//   className,
//   placeholder = "اختر تاريخاً",
//   disabled = false,
// }: DatePickerProps) {
//   return (
//     <Popover>
//       <PopoverTrigger asChild>
//         <div className={cn("relative w-full", className)}>
//           <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
//             <CalendarIcon className="w-4 h-4 text-slate-400" />
//           </div>
//           <button
//             type="button"
//             className={cn(
//               "block w-full ps-10 pe-3 py-2 bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 text-left",
//               !date && "text-slate-500",
//               className
//             )}
//             disabled={disabled}
//           >
//             {date ? format(date, "yyyy/MM/dd") : placeholder}
//           </button>
//         </div>
//       </PopoverTrigger>
//       <PopoverContent className="w-auto p-0 bg-slate-950 border-slate-700 text-slate-100" align="start">
//         <Calendar
//           mode="single"
//           selected={date}
//           onSelect={onChange}
//           autoFocus
//           locale={ar}
//         />
//       </PopoverContent>
//     </Popover>
//   );
// }
