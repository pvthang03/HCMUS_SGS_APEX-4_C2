import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface TidecloakConfig {
  realm: string;
  'auth-server-url': string;
  'ssl-required': string;
  resource: string;
  'public-client': boolean;
  'confidential-port': number;
  jwk: { keys: any[] }; // Embedded JWKS for local verification (Invariant I-04)
  vendorId?: string;
  homeOrkUrl?: string;
}

let _config: TidecloakConfig | null = null;

export function loadTideConfig(): TidecloakConfig {
  if (_config) return _config;

  if (process.env.CLIENT_ADAPTER) {
    try {
      _config = JSON.parse(process.env.CLIENT_ADAPTER);
      return _config!;
    } catch {
      // Fallback to file
    }
  }

  const candidatePaths = [
    join(process.cwd(), 'data', 'tidecloak.json'),
    join(process.cwd(), 'public', 'tidecloak.json'),
    join(process.cwd(), '..', 'data', 'tidecloak.json')
  ];

  for (const configPath of candidatePaths) {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      _config = JSON.parse(content);
      break;
    }
  }

  if (!_config) {
    throw new Error(
      'TideCloak adapter JSON not found. Checked: ' + candidatePaths.join(', ')
    );
  }

  if (!_config.jwk || !_config.jwk.keys || _config.jwk.keys.length === 0) {
    throw new Error(
      'Adapter JSON missing jwk.keys field. ' +
      'This field is required for Tide local JWT verification (Invariant I-04).'
    );
  }

  return _config;
}
