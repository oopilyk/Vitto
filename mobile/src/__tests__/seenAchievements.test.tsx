import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalRepository } from '../services/localRepository';

const KEY = 'vitto.achievements.seen';

describe('seen achievements are remembered per account', () => {
  const repository = new LocalRepository();

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('answers "never asked" for an account it has not stored anything for', async () => {
    // Null is the signal the announcer needs: it seeds silently instead of
    // treating the account's whole history as brand new.
    expect(await repository.loadSeenAchievements('user-a')).toBeNull();

    await repository.saveSeenAchievements('user-a', ['first_meal']);
    expect(await repository.loadSeenAchievements('user-a')).toEqual(['first_meal']);
    // A different account on the same device has still never been asked.
    expect(await repository.loadSeenAchievements('user-b')).toBeNull();
  });

  it('keeps one account\'s list from overwriting another\'s', async () => {
    await repository.saveSeenAchievements('user-a', ['first_meal', 'level_5']);
    await repository.saveSeenAchievements('user-b', ['care_50']);
    await repository.saveSeenAchievements('local', []);

    expect(await repository.loadSeenAchievements('user-a')).toEqual(['first_meal', 'level_5']);
    expect(await repository.loadSeenAchievements('user-b')).toEqual(['care_50']);
    // Signed out is its own scope, and an empty list is not the same as unasked.
    expect(await repository.loadSeenAchievements('local')).toEqual([]);
  });

  it('treats the old device-wide list as belonging to nobody', async () => {
    // Written before the list was keyed by account. It cannot be attributed, so
    // every scope reads it as unasked and seeds silently — announcing nothing it
    // should not, rather than announcing everything.
    await AsyncStorage.setItem(KEY, JSON.stringify(['first_meal', 'level_5']));
    expect(await repository.loadSeenAchievements('user-a')).toBeNull();
    expect(await repository.loadSeenAchievements('local')).toBeNull();

    // And the next write replaces it with the keyed shape.
    await repository.saveSeenAchievements('user-a', ['first_meal']);
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ 'user-a': ['first_meal'] });
  });

  it('survives a corrupt or unreadable store without throwing', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify('not a list'));
    expect(await repository.loadSeenAchievements('user-a')).toBeNull();
    await repository.saveSeenAchievements('user-a', ['first_meal']);
    expect(await repository.loadSeenAchievements('user-a')).toEqual(['first_meal']);
  });
});
