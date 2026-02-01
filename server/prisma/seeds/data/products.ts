import { ProductType } from '@prisma/client';

const baseDrugs = [
  {
    name: 'Panadol',
    generic: 'Paracetamol',
    forms: ['Tablet', 'Syrup', 'IV'],
    strengths: ['500mg', '1g', '120mg/5ml'],
  },
  {
    name: 'Augmentin',
    generic: 'Amoxicillin/Clavulanate',
    forms: ['Tablet', 'Suspension', 'IV'],
    strengths: ['625mg', '1g', '312mg/5ml', '457mg/5ml'],
  },
  {
    name: 'Brufen',
    generic: 'Ibuprofen',
    forms: ['Tablet', 'Syrup', 'Gel'],
    strengths: ['200mg', '400mg', '600mg', '100mg/5ml'],
  },
  {
    name: 'Voltaren',
    generic: 'Diclofenac Sodium',
    forms: ['Tablet', 'Injection', 'Suppository', 'Gel'],
    strengths: ['25mg', '50mg', '75mg', '100mg'],
  },
  {
    name: 'Cataflam',
    generic: 'Diclofenac Potassium',
    forms: ['Tablet'],
    strengths: ['25mg', '50mg'],
  },
  {
    name: 'Nexium',
    generic: 'Esomeprazole',
    forms: ['Tablet', 'IV'],
    strengths: ['20mg', '40mg'],
  },
  {
    name: 'Pantozol',
    generic: 'Pantoprazole',
    forms: ['Tablet', 'IV'],
    strengths: ['20mg', '40mg'],
  },
  {
    name: 'Amoclan',
    generic: 'Amoxicillin/Clavulanate',
    forms: ['Tablet', 'Suspension'],
    strengths: ['1g', '457mg'],
  },
  {
    name: 'Zithromax',
    generic: 'Azithromycin',
    forms: ['Capsule', 'Suspension'],
    strengths: ['250mg', '500mg', '200mg/5ml'],
  },
  {
    name: 'Cipro',
    generic: 'Ciprofloxacin',
    forms: ['Tablet', 'IV'],
    strengths: ['250mg', '500mg', '750mg'],
  },
  {
    name: 'Flagyl',
    generic: 'Metronidazole',
    forms: ['Tablet', 'Suspension', 'IV'],
    strengths: ['250mg', '500mg', '125mg/5ml'],
  },
  {
    name: 'Rocephin',
    generic: 'Ceftriaxone',
    forms: ['Injection'],
    strengths: ['500mg', '1g'],
  },
  {
    name: 'Garamycin',
    generic: 'Gentamicin',
    forms: ['Injection', 'Cream'],
    strengths: ['80mg', '40mg'],
  },
  {
    name: 'Adol',
    generic: 'Paracetamol',
    forms: ['Tablet', 'Drops', 'Suppository'],
    strengths: ['500mg', '100mg/ml', '125mg', '250mg'],
  },
  {
    name: 'Concor',
    generic: 'Bisoprolol',
    forms: ['Tablet'],
    strengths: ['2.5mg', '5mg', '10mg'],
  },
  {
    name: 'Tenormin',
    generic: 'Atenolol',
    forms: ['Tablet'],
    strengths: ['50mg', '100mg'],
  },
  {
    name: 'Diovan',
    generic: 'Valsartan',
    forms: ['Tablet'],
    strengths: ['80mg', '160mg', '320mg'],
  },
  {
    name: 'Exforge',
    generic: 'Amlodipine/Valsartan',
    forms: ['Tablet'],
    strengths: ['5/160mg', '10/160mg', '10/320mg'],
  },
  {
    name: 'Norvasc',
    generic: 'Amlodipine',
    forms: ['Tablet'],
    strengths: ['5mg', '10mg'],
  },
  {
    name: 'Lipitor',
    generic: 'Atorvastatin',
    forms: ['Tablet'],
    strengths: ['10mg', '20mg', '40mg', '80mg'],
  },
  {
    name: 'Crestor',
    generic: 'Rosuvastatin',
    forms: ['Tablet'],
    strengths: ['10mg', '20mg'],
  },
  {
    name: 'Glucophage',
    generic: 'Metformin',
    forms: ['Tablet'],
    strengths: ['500mg', '850mg', '1000mg'],
  },
  {
    name: 'Januvia',
    generic: 'Sitagliptin',
    forms: ['Tablet'],
    strengths: ['50mg', '100mg'],
  },
  {
    name: 'Diamicron',
    generic: 'Gliclazide',
    forms: ['Tablet'],
    strengths: ['30mg', '60mg'],
  },
  {
    name: 'Lantus',
    generic: 'Insulin Glargine',
    forms: ['Pen'],
    strengths: ['100IU/ml'],
  },
  {
    name: 'Novorapid',
    generic: 'Insulin Aspart',
    forms: ['Pen'],
    strengths: ['100IU/ml'],
  },
  {
    name: 'Ventolin',
    generic: 'Salbutamol',
    forms: ['Inhaler', 'Nebules', 'Syrup'],
    strengths: ['100mcg', '2.5mg', '2mg/5ml'],
  },
  {
    name: 'Symbicort',
    generic: 'Budesonide/Formoterol',
    forms: ['Inhaler'],
    strengths: ['160/4.5mcg', '320/9mcg'],
  },
  {
    name: 'Pulmicort',
    generic: 'Budesonide',
    forms: ['Nebules'],
    strengths: ['0.5mg/2ml'],
  },
  {
    name: 'Atrovent',
    generic: 'Ipratropium',
    forms: ['Inhaler', 'Nebules'],
    strengths: ['20mcg', '250mcg/2ml'],
  },
  {
    name: 'Zyrtec',
    generic: 'Cetirizine',
    forms: ['Tablet', 'Syrup'],
    strengths: ['10mg', '5mg/5ml'],
  },
  {
    name: 'Claritin',
    generic: 'Loratadine',
    forms: ['Tablet', 'Syrup'],
    strengths: ['10mg', '5mg/5ml'],
  },
  {
    name: 'Telfast',
    generic: 'Fexofenadine',
    forms: ['Tablet'],
    strengths: ['120mg', '180mg'],
  },
  {
    name: 'Prednisolone',
    generic: 'Prednisolone',
    forms: ['Tablet'],
    strengths: ['5mg', '20mg'],
  },
  {
    name: 'Decadron',
    generic: 'Dexamethasone',
    forms: ['Injection', 'Tablet'],
    strengths: ['4mg/ml', '8mg/2ml', '0.5mg'],
  },
  {
    name: 'Lasix',
    generic: 'Furosemide',
    forms: ['Tablet', 'Injection'],
    strengths: ['40mg', '20mg/2ml'],
  },
  {
    name: 'Aldactone',
    generic: 'Spironolactone',
    forms: ['Tablet'],
    strengths: ['25mg', '100mg'],
  },
  {
    name: 'Plavix',
    generic: 'Clopidogrel',
    forms: ['Tablet'],
    strengths: ['75mg'],
  },
  {
    name: 'Aspirin Protect',
    generic: 'Acetylsalicylic Acid',
    forms: ['Tablet'],
    strengths: ['100mg'],
  },
  {
    name: 'Clexane',
    generic: 'Enoxaparin',
    forms: ['Injection'],
    strengths: ['20mg', '40mg', '60mg', '80mg'],
  },
  {
    name: 'Neurontin',
    generic: 'Gabapentin',
    forms: ['Capsule'],
    strengths: ['100mg', '300mg', '400mg'],
  },
  {
    name: 'Lyrica',
    generic: 'Pregabalin',
    forms: ['Capsule'],
    strengths: ['75mg', '150mg'],
  },
  {
    name: 'Tegretol',
    generic: 'Carbamazepine',
    forms: ['Tablet', 'Syrup'],
    strengths: ['200mg', '400mg'],
  },
  {
    name: 'Xanax',
    generic: 'Alprazolam',
    forms: ['Tablet'],
    strengths: ['0.25mg', '0.5mg'],
  },
  {
    name: 'Lexotanil',
    generic: 'Bromazepam',
    forms: ['Tablet'],
    strengths: ['1.5mg', '3mg'],
  },
  {
    name: 'Seroxat',
    generic: 'Bromazepam',
    forms: ['Tablet'],
    strengths: ['20mg'],
  },
  {
    name: 'Cipralex',
    generic: 'Escitalopram',
    forms: ['Tablet'],
    strengths: ['10mg', '20mg'],
  },
  {
    name: 'Omeprazole',
    generic: 'Omeprazole',
    forms: ['Capsule'],
    strengths: ['20mg', '40mg'],
  },
  {
    name: 'Ranitidine',
    generic: 'Ranitidine',
    forms: ['Tablet', 'Injection'],
    strengths: ['150mg', '50mg/2ml'],
  },
  {
    name: 'Buscopan',
    generic: 'Hyoscine Butylbromide',
    forms: ['Tablet', 'Injection'],
    strengths: ['10mg', '20mg/ml'],
  },
  {
    name: 'Duspatalin',
    generic: 'Mebeverine',
    forms: ['Capsule'],
    strengths: ['200mg'],
  },
  {
    name: 'Motilium',
    generic: 'Domperidone',
    forms: ['Tablet'],
    strengths: ['10mg'],
  },
  {
    name: 'Zofran',
    generic: 'Ondansetron',
    forms: ['Tablet', 'Injection'],
    strengths: ['4mg', '8mg'],
  },
  {
    name: 'Primperan',
    generic: 'Metoclopramide',
    forms: ['Tablet', 'Injection'],
    strengths: ['10mg', '10mg/2ml'],
  },
  {
    name: 'Vitamin D3',
    generic: 'Cholecalciferol',
    forms: ['Tablet', 'Drops'],
    strengths: ['1000IU', '5000IU', '50000IU'],
  },
  {
    name: 'Neurobion',
    generic: 'Vitamin B Complex',
    forms: ['Tablet', 'Injection'],
    strengths: ['Forte'],
  },
  {
    name: 'Folic Acid',
    generic: 'Folic Acid',
    forms: ['Tablet'],
    strengths: ['1mg', '5mg'],
  },
  {
    name: 'Ferrograd',
    generic: 'Ferrous Sulfate',
    forms: ['Tablet'],
    strengths: ['325mg'],
  },
  {
    name: 'Calcium Sandoz',
    generic: 'Calcium Carbonate',
    forms: ['Effervescent'],
    strengths: ['600mg'],
  },
  {
    name: 'Vitamin C',
    generic: 'Ascorbic Acid',
    forms: ['Effervescent', 'Tablet'],
    strengths: ['1g', '500mg'],
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
    drug.forms.forEach((form) => {
      drug.strengths.forEach((strength) => {
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
        });
      });
    });
  });

  // توليد المستلزمات
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
      });
    });
  });

  return products;
}
