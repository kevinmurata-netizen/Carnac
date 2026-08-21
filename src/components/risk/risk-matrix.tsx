import { getRiskBand } from "@/domain/waterline/risk";

/** 5×5 probability × consequence matrix. Rows are POF 5 (top) → 1 (bottom),
 * columns COF 1 → 5. Cell shading comes from the band of pof×cof, cell text
 * is the number of assets whose rounded scores land there. */
export function RiskMatrix({ matrix }: { matrix: number[][] }) {
  const pofLabels = ["Very Low", "Low", "Moderate", "High", "Very High"];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center text-xs">
        <tbody>
          {[5, 4, 3, 2, 1].map((pof) => (
            <tr key={pof}>
              <td className="pr-2 text-right align-middle text-muted-foreground whitespace-nowrap">
                {pofLabels[pof - 1]} ({pof})
              </td>
              {[1, 2, 3, 4, 5].map((cof) => {
                const count = matrix[pof - 1][cof - 1];
                const band = getRiskBand(pof * cof);
                return (
                  <td
                    key={cof}
                    className="h-12 w-16 rounded-md align-middle font-semibold"
                    style={{
                      backgroundColor: `${band.color}${count > 0 ? "" : "26"}`,
                      color: count > 0 ? "white" : "transparent",
                    }}
                    title={`POF ${pof} × COF ${cof} = ${pof * cof} (${band.label})`}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td />
            {["Very Low (1)", "Low (2)", "Moderate (3)", "High (4)", "Very High (5)"].map((label) => (
              <td key={label} className="pt-1 text-muted-foreground">
                {label}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>↑ Probability of Failure</span>
        <span>Consequence of Failure →</span>
      </div>
    </div>
  );
}
