import axios from 'axios';

export function setAcceptLanguageHeader(value: string): void {
  axios.defaults.headers.common['Accept-Language'] = value;
}

export function setTokenHeader(token: string) {
  axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
}

/** Correlate opt-in browser diagnostics with API requests without changing their payloads. */
export function setMessageTraceTab(tabId?: string) {
  if (tabId) {
    axios.defaults.headers.common['X-LibreChat-Tab-Id'] = tabId;
  } else {
    delete axios.defaults.headers.common['X-LibreChat-Tab-Id'];
  }
}
