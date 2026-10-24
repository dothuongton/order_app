export type AlertRequestType = 'CHECKOUT' | 'ASSISTANCE' | 'OPEN_TABLE';

export function getAlertSpeechPrompt(tableName: string, requestType?: AlertRequestType): string {
  if (requestType === 'CHECKOUT') return `${tableName} yêu cầu thanh toán`;
  if (requestType === 'OPEN_TABLE') return `${tableName} yêu cầu mở bàn`;
  return `${tableName} yêu cầu hỗ trợ`;
}
