export const COURSE_TYPE_LABELS: Record<string, string> = {
  'enums.course_type.starter':    'Entrée',
  'enums.course_type.main':       'Plat principal',
  'enums.course_type.dessert':    'Dessert',
  'enums.course_type.sauce':      'Sauce',
  'enums.course_type.drink':      'Boisson',
  'enums.course_type.snack':      'Snack',
  'enums.course_type.side_dish':  'Accompagnement',
  'enums.course_type.breakfast':  'Petit-déj',
  'enums.course_type.soup':       'Soupe',
  'enums.course_type.salad':      'Salade',
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  'enums.difficulty.easy':   'Facile',
  'enums.difficulty.medium': 'Moyen',
  'enums.difficulty.hard':   'Difficile',
};

export const CUISINE_ORIGIN_LABELS: Record<string, string> = {
  'enums.origin_recipe.cuisine_origine.french':       'Française',
  'enums.origin_recipe.cuisine_origine.italian':      'Italienne',
  'enums.origin_recipe.cuisine_origine.spanish':      'Espagnole',
  'enums.origin_recipe.cuisine_origine.greek':        'Grecque',
  'enums.origin_recipe.cuisine_origine.german':       'Allemande',
  'enums.origin_recipe.cuisine_origine.europe':       'Européenne',
  'enums.origin_recipe.cuisine_origine.chinese':      'Chinoise',
  'enums.origin_recipe.cuisine_origine.japanese':     'Japonaise',
  'enums.origin_recipe.cuisine_origine.thai':         'Thaïlandaise',
  'enums.origin_recipe.cuisine_origine.indian':       'Indienne',
  'enums.origin_recipe.cuisine_origine.korean':       'Coréenne',
  'enums.origin_recipe.cuisine_origine.vietnamese':   'Vietnamienne',
  'enums.origin_recipe.cuisine_origine.moroccan':     'Marocaine',
  'enums.origin_recipe.cuisine_origine.african':      'Africaine',
  'enums.origin_recipe.cuisine_origine.africa':       'Africaine',
  'enums.origin_recipe.cuisine_origine.ethiopian':    'Éthiopienne',
  'enums.origin_recipe.cuisine_origine.senegalese':   'Sénégalaise',
  'enums.origin_recipe.cuisine_origine.mexican':      'Mexicaine',
  'enums.origin_recipe.cuisine_origine.american':     'Américaine',
  'enums.origin_recipe.cuisine_origine.brazilian':    'Brésilienne',
  'enums.origin_recipe.cuisine_origine.peruvian':     'Péruvienne',
  'enums.origin_recipe.cuisine_origine.south_america':'Sud-américaine',
  'enums.origin_recipe.cuisine_origine.lebanese':     'Libanaise',
  'enums.origin_recipe.cuisine_origine.turkish':      'Turque',
  'enums.origin_recipe.cuisine_origine.iranian':      'Iranienne',
  'enums.origin_recipe.cuisine_origine.middle_east':  'Moyen-Orient',
  'enums.origin_recipe.cuisine_origine.australian':   'Australienne',
  'enums.origin_recipe.cuisine_origine.polynesian':   'Polynésienne',
  'enums.origin_recipe.cuisine_origine.oceania':      'Océanie',
  'enums.origin_recipe.cuisine_origine.asia':         'Asiatique',
};

export function courseTypeLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return COURSE_TYPE_LABELS[v] ?? null;
}

export function difficultyLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return DIFFICULTY_LABELS[v] ?? null;
}

export function cuisineOriginLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return CUISINE_ORIGIN_LABELS[v] ?? null;
}
