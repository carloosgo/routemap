import {
  IconPlane,
  IconTrain,
  IconBus,
  IconCar,
  IconBuildingSkyscraper,
  IconToolsKitchen2,
  IconBread,
  IconSoup,
  IconMoon,
  IconCompass,
  IconShip,
  IconTicket,
  IconCreditCard,
} from '@tabler/icons-react';

const ICON_SIZE = 15;
const iconDefinition = (icon, bg, color) => ({ icon, bg, color });

export const EXPENSE_ICONS = Object.freeze({
  plane: iconDefinition(<IconPlane size={ICON_SIZE} />, '#eef0fd', '#4f6df5'),
  train: iconDefinition(<IconTrain size={ICON_SIZE} />, '#fff8e6', '#d4a017'),
  bus: iconDefinition(<IconBus size={ICON_SIZE} />, '#e6f7ef', '#2aa866'),
  taxiUber: iconDefinition(<IconCar size={ICON_SIZE} />, '#fce8e8', '#d94f4f'),
  lodging: iconDefinition(
    <IconBuildingSkyscraper size={ICON_SIZE} />,
    '#fff8e6',
    '#d4a017'
  ),
  food: iconDefinition(<IconToolsKitchen2 size={ICON_SIZE} />, '#fce8e8', '#d94f4f'),
  breakfast: iconDefinition(<IconBread size={ICON_SIZE} />, '#fff8e6', '#d4a017'),
  lunch: iconDefinition(<IconSoup size={ICON_SIZE} />, '#fce8e8', '#d94f4f'),
  dinner: iconDefinition(<IconMoon size={ICON_SIZE} />, '#eef0fd', '#4f6df5'),
  transportOther: iconDefinition(<IconCompass size={ICON_SIZE} />, '#e6f7ef', '#2aa866'),
  boat: iconDefinition(<IconShip size={ICON_SIZE} />, '#e6f7ef', '#2aa866'),
  attraction: iconDefinition(<IconTicket size={ICON_SIZE} />, '#eef0fd', '#4f6df5'),
  other: iconDefinition(<IconCreditCard size={ICON_SIZE} />, '#f5f5f5', '#888'),
});

const BOAT_KEYWORDS = Object.freeze([
  'ferri',
  'ferry',
  'barco',
  'crucero',
  'lancha',
  'boat',
  'ship',
]);

export function transportOtherIcon(item) {
  const normalized = String(item?.label || '').toLowerCase();
  return BOAT_KEYWORDS.some((keyword) => normalized.includes(keyword))
    ? EXPENSE_ICONS.boat
    : EXPENSE_ICONS.transportOther;
}
