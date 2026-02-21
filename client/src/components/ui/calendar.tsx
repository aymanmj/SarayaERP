// src/components/ui/calendar.tsx

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      // تفعيل اختيار السنة والشهر من قوائم منسدلة
      captionLayout="dropdown"
      // تحديد نطاق السنوات (من 1900 إلى بعد 10 سنوات من الآن)
      fromYear={1900}
      toYear={new Date().getFullYear() + 10}
      className={cn("relative p-4 bg-slate-950/95 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl w-full flex flex-col items-center", className)}
      classNames={{
        months: "w-full flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-x-reverse sm:space-y-0",
        month: "space-y-4 w-full flex flex-col items-center",
        caption: "flex justify-center pt-2 relative items-center mb-4 w-full",
        caption_label: "hidden", // إخفاء النص العادي لإظهار القوائم المستدلة
        caption_dropdowns: "flex gap-2 justify-center items-center w-full px-10", // مساحة في المنتصف للقوائم
        dropdown: "bg-slate-900 border border-slate-700 text-slate-100 text-sm font-semibold rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 cursor-pointer transition-all hover:bg-slate-800",
        dropdown_icon: "hidden",
        dropdown_month: "ml-1", 
        dropdown_year: "mr-1",
        nav: "absolute top-5 left-4 right-4 flex items-center justify-between pointer-events-none z-20",
        button_previous: "h-8 w-8 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg flex items-center justify-center border border-slate-800 transition-colors cursor-pointer hover:text-white pointer-events-auto",
        button_next: "h-8 w-8 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg flex items-center justify-center border border-slate-800 transition-colors cursor-pointer hover:text-white pointer-events-auto",
        month_grid: "w-full border-collapse space-y-1 mx-auto",
        weekdays: "flex justify-between mb-2 w-full",
        weekday: "text-slate-500 w-9 font-medium text-[0.8rem] uppercase tracking-wider text-center",
        week: "flex justify-between w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 rounded-xl",
        day_button: "h-9 w-9 p-0 font-medium aria-selected:opacity-100 text-slate-300 hover:bg-sky-500/20 hover:text-sky-300 rounded-xl flex items-center justify-center transition-all cursor-pointer m-auto",
        selected: "bg-sky-600 !text-white hover:bg-sky-500 font-bold shadow-md shadow-sky-600/40",
        today: "text-sky-400 font-bold bg-sky-500/10 border border-sky-500/20",
        outside: "text-slate-600 opacity-50 hover:bg-transparent cursor-default",
        disabled: "text-slate-600 opacity-50 cursor-not-allowed hidden",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
      } as any}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };

// import * as React from "react";
// import { ChevronLeft, ChevronRight } from "lucide-react";
// import { DayPicker } from "react-day-picker";

// import { cn } from "@/lib/utils";
// import { buttonVariants } from "@/components/ui/button";

// export type CalendarProps = React.ComponentProps<typeof DayPicker>;

// function Calendar({
//   className,
//   classNames,
//   showOutsideDays = true,
//   ...props
// }: CalendarProps) {
//   return (
//     <DayPicker
//       showOutsideDays={showOutsideDays}
//       className={cn("p-3", className)}
//       classNames={{
//         months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
//         month: "space-y-4",
//         caption: "flex justify-center pt-1 relative items-center",
//         caption_label: "text-sm font-bold text-white",
//         nav: "space-x-1 flex items-center",
//         button_previous: "absolute left-1 h-7 w-7 bg-transparent p-0 opacity-100 hover:bg-slate-800 text-white rounded-md flex items-center justify-center border border-slate-700 transition-colors z-10",
//         button_next: "absolute right-1 h-7 w-7 bg-transparent p-0 opacity-100 hover:bg-slate-800 text-white rounded-md flex items-center justify-center border border-slate-700 transition-colors z-10",

//         // Table Config
//         month_grid: "w-full border-collapse space-y-1", // v9 table
//         table: "w-full border-collapse space-y-1", // v8 legacy

//         // Rows
//         weekdays: "flex", // v9 head row
//         head_row: "flex", // v8 legacy

//         // Head Cells
//         weekday: "text-slate-400 rounded-md w-9 font-normal text-[0.8rem]", // v9 head cell
//         head_cell: "text-slate-400 rounded-md w-9 font-normal text-[0.8rem]", // v8 legacy

//         // Data Rows
//         week: "flex w-full mt-2", // v9 row
//         row: "flex w-full mt-2", // v8 legacy

//         // Cells (The TD)
//         day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-800/50 [&:has([aria-selected])]:bg-slate-800 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20", // v9 cell
//         cell: "h-9 w-9 text-center text-sm p-0 relative ...",

//         // The Button inside the cell
//         day_button: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 text-white hover:bg-slate-700 hover:text-white rounded-md flex items-center justify-center transition-colors cursor-pointer", // v9 button

//         // Modifiers (applied to the button in v9 usually, or root)
//         selected: "bg-blue-600 !text-white hover:bg-blue-700 hover:text-white focus:bg-blue-600 focus:text-white",
//         today: "bg-slate-800 text-white font-bold border border-slate-600",
//         outside: "text-slate-600 opacity-50",
//         disabled: "text-slate-600 opacity-50",
//         range_middle: "aria-selected:bg-slate-800 aria-selected:text-white",
//         hidden: "invisible",

//         ...classNames,
//       }}
//       components={{
//         IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4 text-white" />,
//         IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4 text-white" />,
//       } as any}
//       {...props}
//     />
//   );
// }
// Calendar.displayName = "Calendar";

// export { Calendar };
