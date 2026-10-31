/** Keep login navigation local and explicitly allowlisted. Authorization remains
 * server-side; a Finder-origin login returns unpaid accounts to their dashboard. */
export function loginDestination(search: string): '/account/' | '/property-finder/search/' {
    const values = new URLSearchParams(search).getAll('next');
    return values.length === 1 && values[0] === '/property-finder/search/' ? '/property-finder/search/' : '/account/';
}
