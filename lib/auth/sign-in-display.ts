export interface SignInDisplay {
  label: string
  email: string
  oauthLabel: string | null
}

const OAUTH_SIGN_IN_LABELS: Record<string, string> = {
  google: 'Google Sign-In',
  github: 'GitHub Sign-In',
  apple: 'Apple Sign-In',
  azure: 'Microsoft Sign-In',
  facebook: 'Facebook Sign-In',
}

function oauthSignInLabel(provider: string): string {
  if (OAUTH_SIGN_IN_LABELS[provider]) return OAUTH_SIGN_IN_LABELS[provider]
  const name = provider.charAt(0).toUpperCase() + provider.slice(1)
  return `${name} Sign-In`
}

export function formatSignInDisplay(
  email: string | undefined,
  identities: Array<{ provider?: string }> | undefined,
): SignInDisplay {
  const address = email?.trim() ?? ''
  const providers = (identities ?? [])
    .map((identity) => identity.provider)
    .filter((provider): provider is string => Boolean(provider))
  const hasEmail = providers.includes('email')
  const oauthProviders = providers.filter((provider) => provider !== 'email')

  if (oauthProviders.length > 0 && !hasEmail) {
    return {
      label: 'Email',
      email: address || 'Not set',
      oauthLabel: oauthSignInLabel(oauthProviders[0]),
    }
  }

  if (hasEmail) {
    return {
      label: 'Email',
      email: address || 'Not set',
      oauthLabel: null,
    }
  }

  if (oauthProviders.length > 0) {
    return {
      label: 'Email',
      email: address || 'Not set',
      oauthLabel: oauthSignInLabel(oauthProviders[0]),
    }
  }

  return {
    label: 'Email',
    email: address || 'Not set',
    oauthLabel: null,
  }
}
