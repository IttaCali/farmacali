import { randomUUID } from 'node:crypto';

const suppliers = [
  ['J.I. Cohen', 'DEMO-GT-001', '2420-1000', 'ventas@jicohen.demo.gt', 'Ciudad de Guatemala'],
  ['Drogueria Americana', 'DEMO-GT-002', '2232-4545', 'ventas@drogueriaamericana.demo.gt', 'Zona 1, Ciudad de Guatemala'],
  ['Drogueria Colon', 'DEMO-GT-003', '2251-8080', 'ventas@drogueriacolon.demo.gt', 'Zona 4, Ciudad de Guatemala'],
  ['Unipharm', 'DEMO-GT-004', '2412-7000', 'comercial@unipharm.demo.gt', 'Zona 12, Ciudad de Guatemala'],
  ['LANCASCO', 'DEMO-GT-005', '2329-0900', 'ventas@lancasco.demo.gt', 'Zona 9, Ciudad de Guatemala'],
  ['Laboratorios Bonin', 'DEMO-GT-006', '2439-2800', 'comercial@bonin.demo.gt', 'Mixco, Guatemala'],
  ['Bayer Guatemala', 'DEMO-GT-007', '2278-9000', 'ventas@bayer.demo.gt', 'Zona 10, Ciudad de Guatemala'],
  ['Pfizer Guatemala', 'DEMO-GT-008', '2385-9700', 'ventas@pfizer.demo.gt', 'Zona 10, Ciudad de Guatemala'],
  ['Novartis Guatemala', 'DEMO-GT-009', '2381-4400', 'ventas@novartis.demo.gt', 'Zona 10, Ciudad de Guatemala'],
  ['Sanofi Guatemala', 'DEMO-GT-010', '2338-6000', 'ventas@sanofi.demo.gt', 'Zona 10, Ciudad de Guatemala'],
];

const base = [
  ['Acetaminofen','Acetaminofen','Analgesicos',1850,false],
  ['Ibuprofeno','Ibuprofeno','Antiinflamatorios',2200,false],
  ['Naproxeno','Naproxeno','Antiinflamatorios',2800,false],
  ['Diclofenaco','Diclofenaco','Antiinflamatorios',2400,false],
  ['Ketorolaco','Ketorolaco','Analgesicos',3900,false],
  ['Meloxicam','Meloxicam','Antiinflamatorios',4200,false],
  ['Aspirina','Acido acetilsalicilico','Cardiovascular',1800,false],
  ['Tramadol','Tramadol','Analgesicos controlados',6500,true],
  ['Loratadina','Loratadina','Antialergicos',2450,false],
  ['Cetirizina','Cetirizina','Antialergicos',2600,false],
  ['Desloratadina','Desloratadina','Antialergicos',3800,false],
  ['Fexofenadina','Fexofenadina','Antialergicos',4500,false],
  ['Clorfenamina','Clorfenamina','Antialergicos',1500,false],
  ['Omeprazol','Omeprazol','Gastrointestinal',4500,false],
  ['Esomeprazol','Esomeprazol','Gastrointestinal',5700,false],
  ['Pantoprazol','Pantoprazol','Gastrointestinal',5200,false],
  ['Famotidina','Famotidina','Gastrointestinal',3300,false],
  ['Metoclopramida','Metoclopramida','Gastrointestinal',2100,false],
  ['Loperamida','Loperamida','Gastrointestinal',1900,false],
  ['Simeticona','Simeticona','Gastrointestinal',2300,false],
  ['Amoxicilina','Amoxicilina','Antibioticos',6800,true],
  ['Azitromicina','Azitromicina','Antibioticos',7200,true],
  ['Claritromicina','Claritromicina','Antibioticos',7600,true],
  ['Ciprofloxacino','Ciprofloxacino','Antibioticos',5900,true],
  ['Doxiciclina','Doxiciclina','Antibioticos',5400,true],
  ['Cefalexina','Cefalexina','Antibioticos',6100,true],
  ['Metronidazol','Metronidazol','Antibioticos',3600,true],
  ['Nitrofurantoina','Nitrofurantoina','Antibioticos',4800,true],
  ['Fluconazol','Fluconazol','Antimicoticos',4300,true],
  ['Aciclovir','Aciclovir','Antivirales',5100,true],
  ['Miconazol','Miconazol','Antimicoticos',3700,false],
  ['Terbinafina','Terbinafina','Antimicoticos',6200,false],
  ['Losartan','Losartan','Cardiovascular',7200,true],
  ['Enalapril','Enalapril','Cardiovascular',2900,true],
  ['Amlodipino','Amlodipino','Cardiovascular',3600,true],
  ['Valsartan','Valsartan','Cardiovascular',7900,true],
  ['Atenolol','Atenolol','Cardiovascular',3100,true],
  ['Hidroclorotiazida','Hidroclorotiazida','Cardiovascular',2500,true],
  ['Furosemida','Furosemida','Cardiovascular',2700,true],
  ['Metformina','Metformina','Diabetes',3400,true],
  ['Glibenclamida','Glibenclamida','Diabetes',2800,true],
  ['Levotiroxina','Levotiroxina','Hormonas',4100,true],
  ['Prednisona','Prednisona','Corticosteroides',3600,true],
  ['Dexametasona','Dexametasona','Corticosteroides',3900,true],
  ['Salbutamol','Salbutamol','Respiratorio',4200,false],
  ['Budesonida','Budesonida','Respiratorio',8900,true],
  ['Ambroxol','Ambroxol','Respiratorio',3200,false],
  ['Dextrometorfano','Dextrometorfano','Respiratorio',3500,false],
  ['Acetilcisteina','Acetilcisteina','Respiratorio',4700,false],
  ['Vitamina C','Vitamina C','Vitaminas',5500,false],
];
const products = base.flatMap(([name, component, category, price, prescription]) => [
  { name: `${name} ${name === 'Miconazol' ? '2%' : name === 'Terbinafina' ? '1%' : name === 'Salbutamol' ? '2 mg' : '500 mg'}`, component, category, price, prescription },
  { name: `${name} ${name === 'Miconazol' ? '20 mg/g' : name === 'Terbinafina' ? '250 mg' : name === 'Salbutamol' ? '4 mg' : '650 mg'}`, component, category, price: Math.round(price * 1.25), prescription },
]);

function futureDate(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

export async function seedDemoCatalog(database) {
  if (process.env.SEED_CATALOG !== 'true') return { skipped: true };
  return database.transaction(async (q) => {
    await q(`CREATE TABLE IF NOT EXISTS demo_catalog_runs (key TEXT PRIMARY KEY, created_at TEXT NOT NULL)`);
    if ((await q('SELECT key FROM demo_catalog_runs WHERE key=$1', ['catalog-v1'])).rows.length)
      return { skipped: true, reason: 'already-seeded' };

    const branchRows = (await q("SELECT id,name FROM branches WHERE active=1 ORDER BY name")).rows;
    if (!branchRows.length) throw new Error('No hay sucursales activas para cargar el catalogo demo.');
    const admin = (await q("SELECT id FROM users WHERE id='u-admin' OR role='admin' ORDER BY id LIMIT 1")).rows[0];
    if (!admin) throw new Error('No hay usuario administrador para registrar la carga demo.');

    const supplierIds = [];
    for (const [name, nit, phone, email, address] of suppliers) {
      const found = (await q('SELECT id FROM suppliers WHERE name=$1 OR nit=$2 LIMIT 1', [name, nit])).rows[0];
      const supplierId = found?.id || randomUUID();
      if (!found)
        await q('INSERT INTO suppliers (id,name,nit,phone,email,address,active) VALUES ($1,$2,$3,$4,$5,$6,1)', [supplierId,name,nit,phone,email,address]);
      supplierIds.push(supplierId);
    }

    const productRows = [];
    for (let index = 0; index < products.length; index += 1) {
      const item = products[index];
      const sku = `FC-DEMO-${String(index + 1).padStart(3, '0')}`;
      const found = (await q('SELECT id FROM products WHERE sku=$1', [sku])).rows[0];
      const productId = found?.id || randomUUID();
      if (!found)
        await q('INSERT INTO products (id,name,sku,component,category,price_cents,prescription,controlled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [productId,item.name,sku,item.component,item.category,item.price,item.prescription ? 1 : 0,0]);
      productRows.push({ ...item, id: productId, sku, supplierId: supplierIds[index % supplierIds.length], unitCost: Math.max(100, Math.round(item.price * 0.62)) });
    }

    let inventoryCount = 0;
    for (const branch of branchRows) {
      for (let supplierIndex = 0; supplierIndex < supplierIds.length; supplierIndex += 1) {
        const supplierId = supplierIds[supplierIndex];
        const group = productRows.filter((p) => supplierIds.indexOf(p.supplierId) === supplierIndex);
        if (!group.length) continue;
        const purchaseId = randomUUID();
        await q('INSERT INTO purchase_orders (id,supplier_id,branch_id,status,payment,notes,created_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [purchaseId,supplierId,branch.id,'Recibida','Transferencia','Carga inicial de catalogo para demostracion',new Date().toISOString(),admin.id]);
        for (const product of group) {
          const quantity = 20;
          const lot = `DEMO-${product.sku}-${branch.id}`;
          const inventoryId = randomUUID();
          const lineId = randomUUID();
          const receiptId = randomUUID();
          await q('INSERT INTO purchase_lines (id,purchase_id,product_id,quantity,unit_cost_cents,received) VALUES ($1,$2,$3,$4,$5,$6)', [lineId,purchaseId,product.id,quantity,product.unitCost,quantity]);
          await q('INSERT INTO inventory (id,branch_id,product_id,lot,expires_on,quantity,minimum) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(branch_id,product_id,lot) DO UPDATE SET quantity=EXCLUDED.quantity,expires_on=EXCLUDED.expires_on,minimum=EXCLUDED.minimum', [inventoryId,branch.id,product.id,lot,futureDate(540 + (productRows.indexOf(product) % 180)),quantity,5]);
          const current = (await q('SELECT id FROM inventory WHERE branch_id=$1 AND product_id=$2 AND lot=$3', [branch.id,product.id,lot])).rows[0];
          const actualInventoryId = current.id;
          await q('INSERT INTO inventory_costs (inventory_id,unit_cost_cents,known) VALUES ($1,$2,1) ON CONFLICT(inventory_id) DO UPDATE SET unit_cost_cents=EXCLUDED.unit_cost_cents,known=1', [actualInventoryId,product.unitCost]);
          await q('INSERT INTO purchase_receipts (id,purchase_id,line_id,inventory_id,quantity,unit_cost_cents,document,created_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [receiptId,purchaseId,lineId,actualInventoryId,quantity,product.unitCost,`CARGA-${product.sku}-${branch.id}`,new Date().toISOString(),admin.id]);
          await q('INSERT INTO stock_ledger (id,branch_id,product_id,inventory_id,quantity,type,reference_id,reason,created_at,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [randomUUID(),branch.id,product.id,actualInventoryId,quantity,'COMPRA',purchaseId,'Carga inicial de catalogo demo',new Date().toISOString(),admin.id]);
          inventoryCount += 1;
        }
      }
    }
    await q('INSERT INTO audit_log (id,user_id,action,entity,entity_id,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(),admin.id,'CARGA_DEMO','catalogo','catalog-v1',JSON.stringify({suppliers:suppliers.length,products:productRows.length,branches:branchRows.length,inventory:inventoryCount}),new Date().toISOString()]);
    await q('INSERT INTO demo_catalog_runs (key,created_at) VALUES ($1,$2)', ['catalog-v1',new Date().toISOString()]);
    return { suppliers: suppliers.length, products: productRows.length, branches: branchRows.length, inventory: inventoryCount };
  });
}
