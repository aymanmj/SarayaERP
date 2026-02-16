import { ProductType } from '@prisma/client';

const baseDrugs = [
  {
    name: 'Panadol',
    generic: 'Paracetamol',
    rxCode: '161',
    forms: ['Tablet', 'Syrup', 'IV'],
    strengths: ['500mg', '1g', '120mg/5ml'],
  },
  {
    name: 'Augmentin',
    generic: 'Amoxicillin/Clavulanate',
    rxCode: '18631',
    forms: ['Tablet', 'Suspension', 'IV'],
    strengths: ['625mg', '1g', '312mg/5ml', '457mg/5ml'],
  },
  {
    name: 'Brufen',
    generic: 'Ibuprofen',
    rxCode: '5640',
    forms: ['Tablet', 'Syrup', 'Gel'],
    strengths: ['200mg', '400mg', '600mg', '100mg/5ml'],
  },
  {
    name: 'Voltaren',
    generic: 'Diclofenac Sodium',
    rxCode: '3355',
    forms: ['Tablet', 'Injection', 'Suppository', 'Gel'],
    strengths: ['25mg', '50mg', '75mg', '100mg'],
  },
  {
    name: 'Cataflam',
    generic: 'Diclofenac Potassium',
    rxCode: '3355',
    forms: ['Tablet'],
    strengths: ['25mg', '50mg'],
  },
  {
    name: 'Nexium',
    rxCode: '283742',
    generic: 'Esomeprazole',
    forms: ['Tablet', 'IV'],
    strengths: ['20mg', '40mg'],
  },
  // ... other drugs without rxCode for now
  {
    name: 'Glucophage',
    rxCode: '6809',
    generic: 'Metformin',
    forms: ['Tablet'],
    strengths: ['500mg', '850mg', '1000mg'],
  },
  {
    name: 'Lantus',
    rxCode: '274783',
    generic: 'Insulin Glargine',
    forms: ['Pen'],
    strengths: ['100IU/ml'],
  },
];

const supplies = [
  {
    name: 'Syringe 3ml',
    generic: 'Syringe',
    forms: ['Unit'],
    strengths: ['3ml'],
  },
  {
    name: 'Syringe 5ml',
    generic: 'Syringe',
    forms: ['Unit'],
    strengths: ['5ml'],
  },
  {
    name: 'Syringe 10ml',
    generic: 'Syringe',
    forms: ['Unit'],
    strengths: ['10ml'],
  },
  {
    name: 'Cannula G18',
    generic: 'IV Cannula',
    forms: ['Unit'],
    strengths: ['Green'],
  },
  {
    name: 'Cannula G20',
    generic: 'IV Cannula',
    forms: ['Unit'],
    strengths: ['Pink'],
  },
  {
    name: 'Cannula G22',
    generic: 'IV Cannula',
    forms: ['Unit'],
    strengths: ['Blue'],
  },
  {
    name: 'Cannula G24',
    generic: 'IV Cannula',
    forms: ['Unit'],
    strengths: ['Yellow'],
  },
  {
    name: 'Examination Gloves',
    generic: 'Gloves',
    forms: ['Box'],
    strengths: ['S', 'M', 'L'],
  },
  {
    name: 'Surgical Gloves',
    generic: 'Sterile Gloves',
    forms: ['Pair'],
    strengths: ['6.5', '7.0', '7.5', '8.0'],
  },
  {
    name: 'Face Mask',
    generic: 'Mask',
    forms: ['Box'],
    strengths: ['Earloop'],
  },
  {
    name: 'Gauze Swabs',
    generic: 'Gauze',
    forms: ['Pack'],
    strengths: ['10x10cm'],
  },
  {
    name: 'Cotton Wool',
    generic: 'Cotton',
    forms: ['Roll'],
    strengths: ['500g'],
  },
  {
    name: 'Betadine Solution',
    generic: 'Povidone Iodine',
    forms: ['Bottle'],
    strengths: ['10% 120ml'],
  },
  {
    name: 'Alcohol Swabs',
    generic: 'Isopropyl Alcohol',
    forms: ['Box'],
    strengths: ['100 pcs'],
  },
  {
    name: 'Normal Saline',
    generic: 'Sodium Chloride 0.9%',
    forms: ['Bottle'],
    strengths: ['500ml'],
  },
  {
    name: 'Glucose 5%',
    generic: 'Dextrose 5%',
    forms: ['Bottle'],
    strengths: ['500ml'],
  },
  {
    name: 'Ringer Lactate',
    generic: 'Hartmanns Solution',
    forms: ['Bottle'],
    strengths: ['500ml'],
  },
  {
    name: 'Urine Bag',
    generic: 'Urine Collection Bag',
    forms: ['Unit'],
    strengths: ['2L'],
  },
  {
    name: 'Foley Catheter',
    generic: 'Foley Catheter',
    forms: ['Unit'],
    strengths: ['FR14', 'FR16', 'FR18'],
  },
  {
    name: 'ECG Electrodes',
    generic: 'Electrodes',
    forms: ['Pack'],
    strengths: ['Adult'],
  },
];

export function getProducts() {
  const products: any[] = [];
  let codeCounter = 1000;

  // توليد الأدوية (Combinations)
  baseDrugs.forEach((drug) => {
    // @ts-ignore
    const forms = drug.forms || []; 
    // @ts-ignore
    const strengths = drug.strengths || [];

    forms.forEach((form: any) => {
      strengths.forEach((strength: any) => {
        // سعر عشوائي واقعي بين 5 و 100 دينار
        const basePrice = Math.floor(Math.random() * 95) + 5;

        products.push({
          code: `DRG-${codeCounter++}`,
          name: `${drug.name} ${strength}`,
          genericName: drug.generic,
          type: ProductType.DRUG,
          form: form,
          strength: strength,
          sellPrice: basePrice,
          costPrice: Number((basePrice * 0.7).toFixed(2)), // 30% هامش ربح
          stockOnHand: Math.floor(Math.random() * 500) + 50, // رصيد عشوائي
          minStock: 50,
          rxNormCode: (drug as any).rxCode || null, // ✅ Add RxNorm Code
        });
      });
    });
  });

  // ... (rest of the function for supplies)
  let supplyCounter = 5000;
  supplies.forEach((supply) => {
    supply.strengths.forEach((str) => {
      const price = Math.floor(Math.random() * 20) + 1;
      products.push({
        code: `SUP-${supplyCounter++}`,
        name: `${supply.name} ${str}`,
        genericName: supply.generic,
        type: ProductType.SUPPLY,
        form: supply.forms[0],
        strength: str,
        sellPrice: price,
        costPrice: Number((price * 0.8).toFixed(2)),
        stockOnHand: 1000,
        minStock: 100,
        rxNormCode: null, // Supplies likely don't have RxNorm codes or use different standard
      });
    });
  });

  return products;
}
