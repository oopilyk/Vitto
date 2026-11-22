import { ActionSheetIOS, Alert } from 'react-native';
import { usernameError } from '@vitto/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { askReportOrBlock, askReportReply } from '../components/safetyActions';

jest.mock('../services/friendsService', () => ({
  friendsService: { reportUser: jest.fn(() => Promise.resolve()), blockUser: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../services/companionService', () => ({
  companionService: { reportReply: jest.fn(() => Promise.resolve()) },
}));
const mockCompanion = jest.requireMock('../services/companionService').companionService as { reportReply: jest.Mock };
const mockService = jest.requireMock('../services/friendsService').friendsService as {
  reportUser: jest.Mock;
  blockUser: jest.Mock;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 400));

beforeEach(() => {
  jest.restoreAllMocks();
  mockService.reportUser.mockClear();
  mockService.blockUser.mockClear();
});

describe('report and block', () => {
  it('reports with a reason, then offers to block as well', async () => {
    const sheets = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    askReportOrBlock({ userId: 'u2', name: '@alex' });
    expect(sheets.mock.calls[0]![0].options).toEqual(['Report @alex', 'Block @alex', 'Cancel']);
    sheets.mock.calls[0]![1](0);
    await flush();
    expect(sheets.mock.calls[1]![0].title).toBe('Why are you reporting @alex?');
    sheets.mock.calls[1]![1](1); // Harassment or bullying
    await flush();
    expect(mockService.reportUser).toHaveBeenCalledWith('u2', 'harassment');
    expect(alert.mock.calls[0]![0]).toBe('Report sent');
    expect(alert.mock.calls[0]![2]!.map((button) => button.text)).toEqual(['Block @alex', 'Done']);
  });

  it('blocks only after saying what it does, and then leaves their pet', async () => {
    const sheets = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onBlocked = jest.fn();
    askReportOrBlock({ userId: 'u2', name: '@alex', onBlocked });
    sheets.mock.calls[0]![1](1);
    await flush();
    expect(mockService.blockUser).not.toHaveBeenCalled();
    const [title, body, buttons] = alert.mock.calls[0]!;
    expect(title).toBe('Block @alex?');
    expect(body).toContain("They won't be told");
    buttons!.find((button) => button.text === 'Block')!.onPress!();
    await flush();
    expect(mockService.blockUser).toHaveBeenCalledWith('u2');
    expect(onBlocked).toHaveBeenCalled();
  });
});

describe('reporting what the pet said', () => {
  it('asks why, sends it, and marks it reported', async () => {
    const sheets = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onReported = jest.fn();
    askReportReply({ messageId: 'm1', petName: 'Blue', onReported });
    expect(sheets.mock.calls[0]![0].options).toEqual(['Report reply', 'Cancel']);
    sheets.mock.calls[0]![1](0);
    await flush();
    expect(sheets.mock.calls[1]![0].options).toContain('Harmful or dangerous advice');
    sheets.mock.calls[1]![1](2);
    await flush();
    expect(mockCompanion.reportReply).toHaveBeenCalledWith('m1', 'harmful');
    expect(onReported).toHaveBeenCalled();
    expect(alert.mock.calls[0]![0]).toBe('Report sent');
  });
});

describe('what other people see is filtered', () => {
  it('refuses a username with a blocked term in it', () => {
    // From the fixture the filter's hashes are made from: the app carries no term itself.
    const fixture = readFileSync(join(__dirname, '../../../packages/core/src/data/offensiveWords.fixture.txt'), 'utf8').split('\n');
    const severe = fixture.slice(fixture.findIndex((line) => line.startsWith('[severe]')) + 1);
    const term = severe.map((line) => line.trim()).find((word) => /^[a-z]{4,10}$/.test(word))!;
    expect(usernameError(`the_${term}`)).toBe("That username isn't allowed. Try another.");
    expect(usernameError('kyle_li')).toBeNull();
  });
});
