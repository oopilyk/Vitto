import { ActionSheetIOS, Alert } from 'react-native';
import { usernameError } from '@vitto/core';
import { BLOCKED_TERMS } from '../../../packages/core/src/data/blockedTerms';
import { askReportOrBlock } from '../components/safetyActions';

jest.mock('../services/friendsService', () => ({
  friendsService: { reportUser: jest.fn(() => Promise.resolve()), blockUser: jest.fn(() => Promise.resolve()) },
}));
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

describe('what other people see is filtered', () => {
  it('refuses a username with a blocked term in it', () => {
    const term = BLOCKED_TERMS.find((word) => /^[a-z]{4,10}$/.test(word))!;
    expect(usernameError(`the_${term}`)).toBe("That username isn't allowed. Try another.");
    expect(usernameError('kyle_li')).toBeNull();
  });
});
