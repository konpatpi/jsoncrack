import React from "react";
import type { NodeData } from "../types";
import styles from "./Node.module.css";
import { TextRenderer } from "./TextRenderer";
import { getTextColor } from "./nodeStyles";

type TextNodeProps = {
  node: NodeData;
  x: number;
  y: number;
};

const TextNodeBase = ({ node, x, y }: TextNodeProps) => {
  const { text, width, height } = node;
  const firstRow = text[0];

  if (!firstRow) return null;

  const value = firstRow.value;
  const isMultiline = typeof value === "string" && value.includes("\n");

  if (isMultiline) {
    const lines = (value as string).split("\n");
    return (
      <foreignObject
        className={`${styles.foreignObject} ${styles.objectForeignObject}`}
        data-id={`node-${node.id}`}
        width={width}
        height={height}
        x={0}
        y={0}
      >
        {lines.map((line, i) => {
          const sepIdx = line.indexOf(": ");
          const hasKey = sepIdx !== -1;
          const keyPart = hasKey ? line.slice(0, sepIdx) : null;
          const valPart = hasKey ? line.slice(sepIdx + 2) : line;

          let valueColor = getTextColor({ value: valPart, type: "string" });
          if (keyPart === "result") {
            if (valPart === "PASS") valueColor = "var(--eval-pass-stroke)";
            else if (valPart === "FAIL") valueColor = "var(--eval-fail-stroke)";
            else if (valPart === "ERROR") valueColor = "var(--eval-error-stroke)";
          }

          return (
            <span
              key={i}
              className={styles.row}
              data-x={x}
              data-y={y}
            >
              {hasKey && (
                <span
                  className={styles.key}
                  style={{ color: getTextColor({ type: "object", value: keyPart }) }}
                >
                  {keyPart}:{" "}
                </span>
              )}
              <span style={{ color: valueColor }}>
                <TextRenderer>{valPart}</TextRenderer>
              </span>
            </span>
          );
        })}
      </foreignObject>
    );
  }

  return (
    <foreignObject
      className={styles.foreignObject}
      data-id={`node-${node.id}`}
      width={width}
      height={height}
      x={0}
      y={0}
    >
      <span
        className={styles.textNodeWrapper}
        data-x={x}
        data-y={y}
        data-key={JSON.stringify(text)}
      >
        <span className={styles.key} style={{ color: getTextColor({ value, type: typeof value }) }}>
          <TextRenderer>{value}</TextRenderer>
        </span>
      </span>
    </foreignObject>
  );
};

const propsAreEqual = (prev: TextNodeProps, next: TextNodeProps) => {
  return prev.node.text === next.node.text && prev.node.width === next.node.width;
};

export const TextNode = React.memo(TextNodeBase, propsAreEqual);
