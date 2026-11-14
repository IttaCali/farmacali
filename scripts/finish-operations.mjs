import { readFileSync,writeFileSync } from 'node:fs';
for(const file of ['server/models/pharmacy.js','server/models/management.js','src/components/Operations.jsx']){
  let source=readFileSync(file,'utf8').replaceAll("('Preparando','En ruta')","('Pendiente','Preparando','En ruta')").replaceAll("['Preparando','En ruta']","['Pendiente','Preparando','En ruta']");
  if(file.endsWith('management.js')){
    source=source.replace("before.status!=='Preparando'","before.status!=='Pendiente'").replace('Solo se puede editar o reasignar antes de despachar.','Solo se puede editar o reasignar antes de iniciar la preparación.');
    source=source.replace("const employee=(await q('SELECT branch_id FROM employees WHERE id=$1',[row.employee_id])).rows[0];branch=employee.branch_id;","branch=row.branch_id;");
    source=source.replace("const points=shifts.length*2+", "const discounts=data.orders.filter(o=>o.branch_id===b.id&&o.status==='Entregado'&&o.discount_percent>=15).length;const points=discounts*2+shifts.length*2+").replace("reasons:[`${shifts.length}","reasons:[`${discounts} ventas con descuento de 15% o más`,`${shifts.length}");
  }
  if(file.endsWith('Operations.jsx')){
    source=source.replace("data.orders.filter(o=>o.status==='Preparando')","data.orders.filter(o=>o.status==='Pendiente')");
    source=source.replace("Antes de despachar","Antes de preparar");
    source=source.replace("number('salary','Salario mensual Q'),","number('salary','Salario mensual Q'),{name:'user_id',label:'Usuario vinculado (opcional)',required:false,options:[{value:'',label:'Sin vínculo'},...select(data.users)]},");
  }
  writeFileSync(file,source);
}
let view=readFileSync('src/App.jsx','utf8');
view=view.replace("r.status === 'Preparando'\n                                      ? 'Despachar pedido'","r.status === 'Pendiente' ? 'Iniciar preparación' : r.status === 'Preparando'\n                                      ? 'Despachar pedido'");
view=view.replace("r.status === 'Preparando'\n                                      ? 'Confirma que", "r.status === 'Pendiente' ? 'Confirma que la farmacia comenzará la preparación. Ya no se podrá editar ni reasignar.' : r.status === 'Preparando'\n                                      ? 'Confirma que");
view=view.replace("status: r.status === 'Preparando' ? 'En ruta' : 'Entregado'","status: r.status === 'Pendiente' ? 'Preparando' : r.status === 'Preparando' ? 'En ruta' : 'Entregado'");
view=view.replace("{r.status === 'Preparando' ? 'Despachar' : 'Entregar'}","{r.status === 'Pendiente' ? 'Preparar' : r.status === 'Preparando' ? 'Despachar' : 'Entregar'}");
// Cancellation uses a form so the reason is mandatory, rather than a reasonless confirmation.
const start=view.indexOf("type: 'confirm',\n                                  title: 'Cancelar pedido'");
if(start<0)throw new Error('No se encontró el diálogo de cancelación.');
const end=view.indexOf("method: 'PATCH',",start)+"method: 'PATCH',".length;
view=view.slice(0,start)+"type:'form',title:'Cancelar pedido',path:`/orders/${r.id}/status`,method:'PATCH',fields:[{name:'reason',label:'Motivo de cancelación',wide:true},{name:'status',label:'Acción',options:[{value:'Cancelado',label:'Cancelar y liberar existencias'}]}],"+view.slice(end);
view=view.replace("{name:'nit',label:'NIT',default:'CF'},","{name:'nit',label:'NIT',default:'CF'},{name:'discount_percent',label:'Descuento %',type:'number',min:0,max:50,step:'0.01',default:0},");
writeFileSync('src/App.jsx',view);
for(const file of ['tests/pharmacy.test.js','tests/postgres.test.js','tests/persistence.test.js']){
  let source=readFileSync(file,'utf8');
  source=source.replaceAll("await model.orderStatus(o.id, { status: 'En ruta' }, user);","await model.orderStatus(o.id, { status: 'Preparando' }, user);\n  await model.orderStatus(o.id, { status: 'En ruta' }, user);");
  source=source.replaceAll("{ status: 'Cancelado' }","{ status: 'Cancelado',reason:'Cancelación de prueba' }");
  writeFileSync(file,source);
}
