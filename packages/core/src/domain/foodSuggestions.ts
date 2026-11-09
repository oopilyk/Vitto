import type { HealthEvent, MealMetadata } from './health';

/**
 * Everyday foods to suggest while a search is typed: free and instant, where
 * the search itself goes to a rate-limited server (60 an hour per account).
 * Plain names, as people type them, not database names.
 */
export const COMMON_FOODS: readonly string[] = [
  'Apple', 'Avocado', 'Bacon', 'Bagel', 'Banana', 'Beef jerky', 'Black beans', 'Blueberries', 'Bread', 'Broccoli',
  'Brown rice', 'Burrito', 'Butter', 'Caesar salad', 'Carrots', 'Cereal', 'Cheddar cheese', 'Cheeseburger', 'Chicken breast',
  'Chicken thigh', 'Chicken wings', 'Chickpeas', 'Chocolate', 'Chocolate milk', 'Coffee', 'Cottage cheese', 'Cream cheese',
  'Croissant', 'Cucumber', 'Dark chocolate', 'Eggs', 'French fries', 'Fried rice', 'Granola', 'Granola bar', 'Grapes',
  'Greek yogurt', 'Green beans', 'Ground beef', 'Ground turkey', 'Ham', 'Hamburger', 'Hot dog', 'Hummus', 'Ice cream',
  'Kale', 'Lasagna', 'Lentils', 'Mac and cheese', 'Mango', 'Milk', 'Mozzarella', 'Muffin', 'Oatmeal', 'Oats', 'Olive oil',
  'Orange', 'Orange juice', 'Pancakes', 'Pasta', 'Peanut butter', 'Peanuts', 'Pear', 'Pepperoni pizza', 'Pineapple',
  'Pizza', 'Pork chop', 'Potato', 'Protein bar', 'Protein shake', 'Quinoa', 'Ramen', 'Raspberries', 'Rice', 'Salmon',
  'Sandwich', 'Shrimp', 'Smoothie', 'Sour cream', 'Sourdough bread', 'Soy milk', 'Spaghetti', 'Spinach', 'Steak',
  'Strawberries', 'String cheese', 'Sushi', 'Sweet potato', 'Taco', 'Tofu', 'Tomato', 'Tortilla', 'Tuna', 'Turkey',
  'Turkey sandwich', 'Waffles', 'Walnuts', 'Watermelon', 'White rice', 'Whole wheat bread', 'Wrap', 'Yogurt', 'Zucchini',
];

/** The foods this person has logged, newest first, each name once. */
export const loggedFoodNames = (events: readonly HealthEvent[]): string[] => {
  const seen = new Set<string>();
  const names: string[] = [];
  const meals = events
    .filter((event) => event.type === 'MEAL')
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  for (const event of meals) {
    for (const food of (event.metadata as MealMetadata).analysis?.detectedFoods ?? []) {
      const key = food.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(food.trim());
    }
  }
  return names;
};

/**
 * Up to `limit` names that complete what has been typed: a word in the name
 * starting with it ("cream" finds "Sour cream"). Their own foods come first,
 * then common ones; never the text exactly as typed, which is already there.
 */
export const foodSuggestions = (query: string, known: readonly string[] = [], limit = 5): string[] => {
  const typed = query.trim().toLowerCase();
  if (typed.length < 2) return [];
  const completes = (name: string) => {
    const lower = name.toLowerCase();
    return lower !== typed && (lower.startsWith(typed) || lower.split(/[\s,-]+/).some((word) => word.startsWith(typed)));
  };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...known, ...COMMON_FOODS]) {
    const key = name.toLowerCase();
    if (seen.has(key) || !completes(name)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
};
