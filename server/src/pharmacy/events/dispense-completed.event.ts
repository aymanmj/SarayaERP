// src/pharmacy/events/dispense-completed.event.ts

export class DispenseCompletedEvent {
  constructor(
    public readonly dispenseRecordId: number,
    public readonly hospitalId: number,
    public readonly userId: number,
    public readonly totalCost: number, // التكلفة (وليس سعر البيع)
  ) {}
}

// // src/pharmacy/events/dispense-completed.event.ts

// export class DispenseCompletedEvent {
//   constructor(
//     public readonly dispenseRecordId: number,
//     public readonly hospitalId: number,
//     public readonly userId: number,
//     public readonly totalCost: number, // التكلفة الإجمالية للأدوية المصروفة
//     public readonly items: {
//       productId: number;
//       quantity: number;
//       unitCost: number;
//       totalCost: number;
//     }[],
//   ) {}
// }
