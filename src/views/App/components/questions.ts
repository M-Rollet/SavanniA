export type Question = {
  id: string;
  label: string;
};

export const QUESTIONS: Question[] = [
  { id: 'light_working', label: 'La lumière fonctionne ?' },
  { id: 'ir_working', label: 'Capteurs de distance fonctionnent ?' },
  { id: 'motor_noise', label: 'Moteur bruyant ?' },
  { id: 'battery_low', label: 'Batterie faible ?' },
  { id: 'battery_mid', label: 'Batterie moyenne ?' },
  { id: 'battery_full', label: 'Batterie pleine ?' },
];
