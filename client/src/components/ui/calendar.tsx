import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

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
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-bold text-white",
        nav: "space-x-1 flex items-center",
        button_previous: "absolute left-1 h-7 w-7 bg-transparent p-0 opacity-100 hover:bg-slate-800 text-white rounded-md flex items-center justify-center border border-slate-700 transition-colors z-10",
        button_next: "absolute right-1 h-7 w-7 bg-transparent p-0 opacity-100 hover:bg-slate-800 text-white rounded-md flex items-center justify-center border border-slate-700 transition-colors z-10",
        
        // Table Config
        month_grid: "w-full border-collapse space-y-1", // v9 table
        table: "w-full border-collapse space-y-1", // v8 legacy
        
        // Rows
        weekdays: "flex", // v9 head row
        head_row: "flex", // v8 legacy
        
        // Head Cells
        weekday: "text-slate-400 rounded-md w-9 font-normal text-[0.8rem]", // v9 head cell
        head_cell: "text-slate-400 rounded-md w-9 font-normal text-[0.8rem]", // v8 legacy
        
        // Data Rows
        week: "flex w-full mt-2", // v9 row
        row: "flex w-full mt-2", // v8 legacy
        
        // Cells (The TD)
        day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-800/50 [&:has([aria-selected])]:bg-slate-800 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20", // v9 cell
        cell: "h-9 w-9 text-center text-sm p-0 relative ...", 
        
        // The Button inside the cell
        day_button: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 text-white hover:bg-slate-700 hover:text-white rounded-md flex items-center justify-center transition-colors cursor-pointer", // v9 button
        
        // Modifiers (applied to the button in v9 usually, or root)
        selected: "bg-blue-600 !text-white hover:bg-blue-700 hover:text-white focus:bg-blue-600 focus:text-white",
        today: "bg-slate-800 text-white font-bold border border-slate-600",
        outside: "text-slate-600 opacity-50",
        disabled: "text-slate-600 opacity-50",
        range_middle: "aria-selected:bg-slate-800 aria-selected:text-white",
        hidden: "invisible",
        
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4 text-white" />,
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4 text-white" />,
      } as any}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
