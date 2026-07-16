export type Question = {
  id: string;
  label: string;
};

export const QUESTIONS: Question[] = [
  { id: 'light_working', label: 'La lumière fonctionne\u00A0?' },
  { id: 'ir_working', label: 'Capteurs de distance fonctionnent\u00A0?' },
  { id: 'motor_noise', label: 'Moteur bruyant\u00A0?' },
  { id: 'battery_low', label: 'Batterie faible\u00A0?' },
  { id: 'battery_mid', label: 'Batterie moyenne\u00A0?' },
  { id: 'battery_full', label: 'Batterie pleine\u00A0?' },
];
