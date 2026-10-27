export async function readApiResponse<T>(response: Response): Promise<T> {
  const body = await response.text()
  let result: T
  try {
    result = JSON.parse(body) as T
  } catch {
    if (response.headers.get('content-type')?.includes('text/html') || body.trimStart().startsWith('<')) {
      throw new Error('The server returned the website page instead of the account API. Configure the /api/ proxy to reach the account service.')
    }
    throw new Error('The account API returned an invalid response. Check that the account service is running.')
  }
  return result
}
