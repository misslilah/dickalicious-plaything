import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Category } from '../types';

interface CategoryCardProps {
  category: Category;
  taskCount: number;
}

export function CategoryCard({ category, taskCount }: CategoryCardProps) {
  return (
    <Link
      to={`/category/${category.id}`}
      className="category-card"
      style={{ '--cat-color': category.color } as CSSProperties}
    >
      <div className="category-card__image-wrap">
        {category.imageUrl ? (
          <img
            src={category.imageUrl}
            alt=""
            className="category-card__image"
          />
        ) : (
          <div className="category-card__placeholder" aria-hidden>
            <span className="category-card__icon">{category.icon}</span>
          </div>
        )}
      </div>
      <div className="category-card__body">
        <h3 className="category-card__name">{category.name}</h3>
        <p className="category-card__meta muted">
          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
        </p>
      </div>
    </Link>
  );
}
