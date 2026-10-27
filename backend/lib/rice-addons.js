const NON_VIAND_TERMS =
  /\b(drinks?|beverages?|water|juice|soda|coffee|tea|milk|shake|smoothie|frappe|snacks?|chips?|fries|candy|chocolate|cookies?|biscuits?|popcorn|crackers?|nuts?|cake|ice cream|dessert|candy|candies)\b/i;

function isRiceAddonEligible(productName, categoryName) {
  if (['drinks', 'snacks'].includes(String(categoryName || '').trim().toLowerCase())) {
    return false;
  }
  return !NON_VIAND_TERMS.test(productName || '');
}

function riceAddonPrice(option) {
  if (option === 'half') return 8;
  if (option === 'full') return 15;
  return 0;
}

function riceAddonLabel(option) {
  if (option === 'half') return '½ cup rice';
  if (option === 'full') return '1 cup rice';
  return '';
}

module.exports = { isRiceAddonEligible, riceAddonLabel, riceAddonPrice };
