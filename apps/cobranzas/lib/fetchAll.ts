/**
 * Paginate through ALL rows of a Supabase query using .range().
 * PostgREST has a server-side max-rows cap (default 1 000) that ignores
 * .limit(), but it always honours explicit Range headers (.range()).
 * Call this instead of .limit() for any query that may exceed 1 000 rows.
 */
export async function fetchAll<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const all: T[] = [];

  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;   // last page — done
    from += PAGE;
  }

  return all;
}
