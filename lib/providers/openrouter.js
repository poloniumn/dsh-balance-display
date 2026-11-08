/**
 * OpenRouter — credits live behind `/api/v1/credits`, but that call returns the
 * lifetime totals rather than the current balance for most accounts, so the
 * row links to the credits page instead of guessing.
 */
export default {
  id: 'openrouter',
  label: 'OpenRouter',
  kind: 'console',
  order: 51,
  secret: null,
  consoleUrl: 'https://openrouter.ai/settings/credits',
}