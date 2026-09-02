/** Paginated data table for business lists. */
export interface DataTableProps {
  pagination?: boolean;
  loading?: boolean;
}

export function DataTable(_props: DataTableProps) {
  return <table />;
}
