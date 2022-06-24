import React from "react"
import { ReactElement, useEffect, useState } from "react"
import ReactDOM from "react-dom"

export const Modal = ({
    children,
    onClose,
}: {
    children: React.ReactElement
    onClose: VoidFunction
}): ReactElement | null => {
    const [container, setContainer] = useState<Element | null>(null)

    useEffect(() => {
        const modalClass = "modal"
        let modalContainer = document.querySelector(`.${modalClass}`)
        if (!modalContainer) {
            modalContainer = document.createElement("div")
            modalContainer.classList.add(modalClass)
            document.body.appendChild(modalContainer)
            setContainer(modalContainer)
        }
        return () => {
            if (!modalContainer) return
            document.body.removeChild(modalContainer)
        }
    }, [])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose()
            }
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => {
            document.removeEventListener("keydown", handleKeyDown)
        }
    }, [])

    if (!container) return null
    return ReactDOM.createPortal(
        <div className="modal-panel">{children}</div>,
        container
    )
}