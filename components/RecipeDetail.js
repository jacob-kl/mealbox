import { formatQty } from '@/lib/nutrition';

export default function RecipeDetail({ recipe }) {
  if (!recipe) return null;
  return (
    <div className="mt-3 pt-3 border-t border-line text-sm">
      {recipe.ingredients?.length > 0 && (
        <>
          <p className="font-medium mb-1">Ingredients</p>
          <ul className="list-disc list-inside space-y-0.5 text-ink/70 mb-3">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {formatQty(ing.qty, ing.unit)} {ing.ingredient}
                {ing.note ? ` — ${ing.note}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      {recipe.steps?.length > 0 && (
        <>
          <p className="font-medium mb-1">Steps</p>
          <ol className="list-decimal list-inside space-y-0.5 text-ink/70">
            {recipe.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
