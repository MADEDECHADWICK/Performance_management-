interface ProfitabilityData {
  total_revenue: number;
  total_cost: number;
  profit: number;
  profit_margin: number;
  total_hours?: number;
  error?: string;
}

interface ProfitabilityCardProps {
  data: ProfitabilityData;
  loading?: boolean;
  title?: string;
}

export function ProfitabilityCard({ data, loading, title = "Profitability" }: ProfitabilityCardProps) {
  if (loading) {
    return (
      <div className="border rounded-lg p-6 bg-white">
        <h3 className="font-semibold mb-4">{title}</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="border rounded-lg p-6 bg-red-50">
        <h3 className="font-semibold text-red-800 mb-2">{title}</h3>
        <p className="text-sm text-red-600">{data.error}</p>
      </div>
    );
  }

  const marginColor = 
    data.profit_margin >= 50 ? 'text-green-700' :
    data.profit_margin >= 30 ? 'text-blue-700' :
    data.profit_margin >= 10 ? 'text-yellow-700' :
    'text-red-700';

  return (
    <div className="border rounded-lg p-6 bg-white">
      <h3 className="font-semibold mb-4">{title}</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {data.total_hours !== undefined && (
          <div>
            <p className="text-xs text-gray-600 uppercase">Total Hours</p>
            <p className="text-xl font-bold">{data.total_hours}</p>
          </div>
        )}
        
        <div>
          <p className="text-xs text-gray-600 uppercase">Revenue</p>
          <p className="text-xl font-bold text-blue-700">
            {data.total_revenue.toLocaleString()} KES
          </p>
        </div>
        
        <div>
          <p className="text-xs text-gray-600 uppercase">Cost</p>
          <p className="text-xl font-bold text-gray-700">
            {data.total_cost.toLocaleString()} KES
          </p>
        </div>
        
        <div>
          <p className="text-xs text-gray-600 uppercase">Profit</p>
          <p className={`text-xl font-bold ${data.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {data.profit.toLocaleString()} KES
          </p>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Profit Margin</span>
          <span className={`text-2xl font-bold ${marginColor}`}>
            {data.profit_margin.toFixed(1)}%
          </span>
        </div>
        
        {data.profit_margin >= 50 && (
          <p className="text-xs text-green-600 mt-2">✓ Excellent margin</p>
        )}
        {data.profit_margin >= 30 && data.profit_margin < 50 && (
          <p className="text-xs text-blue-600 mt-2">✓ Good margin</p>
        )}
        {data.profit_margin < 10 && (
          <p className="text-xs text-red-600 mt-2">⚠ Low margin - consider reviewing rates</p>
        )}
      </div>
    </div>
  );
}
