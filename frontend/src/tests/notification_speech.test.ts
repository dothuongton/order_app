import { describe, expect, it } from 'vitest';
import { getAlertSpeechPrompt } from '../lib/notification-speech.js';

describe('staff alert speech prompts', () => {
  it('uses the requested action for opening a table', () => {
    expect(getAlertSpeechPrompt('Bàn 12', 'OPEN_TABLE')).toBe('Bàn 12 yêu cầu mở bàn');
  });

  it('keeps assistance and checkout prompts distinct', () => {
    expect(getAlertSpeechPrompt('Bàn VIP', 'ASSISTANCE')).toBe('Bàn VIP yêu cầu hỗ trợ');
    expect(getAlertSpeechPrompt('Bàn VIP', 'CHECKOUT')).toBe('Bàn VIP yêu cầu thanh toán');
  });
});
