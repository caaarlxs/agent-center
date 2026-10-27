import type { ReactFlowProps } from "@xyflow/react";
import { Background, BackgroundVariant, ReactFlow } from "@xyflow/react";
import type { ReactNode } from "react";

import "@xyflow/react/dist/style.css";

type CanvasProps = ReactFlowProps & {
  children?: ReactNode;
};


export const Canvas = ({ children, ...props }: CanvasProps) => (
  <ReactFlow
    deleteKeyCode={null}
    fitView
    panOnDrag={false}
    panOnScroll
    selectionOnDrag={true}
    zoomOnDoubleClick={false}
    {...props}
  >
    {/* Dots on the 24 px grid, as the classic canvas (styles.css:754-758). */}
    <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} offset={12} color="var(--line)" bgColor="var(--bg)" />
    {children}
  </ReactFlow>
);
