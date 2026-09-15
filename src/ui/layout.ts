export type DashboardMode='normal'|'compact'|'minimal';
export interface DashboardLayout { mode:DashboardMode; maxRows:number; headerRows:number; focusRows:number; taskRows:number; messageRows:number; toolRows:number; footerRows:number; }
export function dashboardLayout(stdoutRows:number,configuredMax=26):DashboardLayout{
  const rows=Math.max(8,Number(stdoutRows)||24); const maxRows=Math.max(7,Math.min(configuredMax,rows-2));
  if(rows<16) return {mode:'minimal',maxRows,headerRows:5,focusRows:0,taskRows:0,messageRows:0,toolRows:0,footerRows:1};
  if(rows<24) return {mode:'compact',maxRows,headerRows:6,focusRows:4,taskRows:0,messageRows:2,toolRows:3,footerRows:1};
  return {mode:'normal',maxRows,headerRows:8,focusRows:5,taskRows:2,messageRows:3,toolRows:4,footerRows:1};
}
