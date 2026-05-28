interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  description?: string;
  color?: "blue" | "green" | "amber" | "purple" | "rose";
}

const colorMap = {
  blue: "bg-blue-50 border-blue-100 text-blue-700",
  green: "bg-green-50 border-green-100 text-green-700",
  amber: "bg-amber-50 border-amber-100 text-amber-700",
  purple: "bg-purple-50 border-purple-100 text-purple-700",
  rose: "bg-rose-50 border-rose-100 text-rose-700",
};

const valueColorMap = {
  blue: "text-blue-600",
  green: "text-green-600",
  amber: "text-amber-600",
  purple: "text-purple-600",
  rose: "text-rose-600",
};

export default function MetricCard({
  label,
  value,
  unit,
  description,
  color = "blue",
}: MetricCardProps) {
  return (
    <div className={`border rounded-xl p-4 ${colorMap[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold ${valueColorMap[color]}`}>
        {value}
        {unit && <span className="text-sm font-normal ml-1">{unit}</span>}
      </p>
      {description && (
        <p className="text-xs opacity-60 mt-1">{description}</p>
      )}
    </div>
  );
}
