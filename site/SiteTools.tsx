import React from "react"
import ReactDOM from "react-dom"
import { FeedbackPrompt } from "./Feedback.js"
import { ScrollDirection, useScrollDirection } from "./hooks.js"
import {
    NewsletterSubscription,
    NewsletterSubscriptionForm,
    NewsletterSubscriptionContext,
} from "./NewsletterSubscription.js"
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome/index.js"
// import { faHandshake } from "@fortawesome/free-solid-svg-icons"

const SITE_TOOLS_CLASS = "site-tools"

const SiteTools = () => {
    const scrollDirection = useScrollDirection()

    return (
        <div
            className={`hide-wrapper${
                (scrollDirection === ScrollDirection.Down && " hide") || ""
            }`}
        >
            <NewsletterSubscription
                context={NewsletterSubscriptionContext.Floating}
            />
            <FeedbackPrompt />
            {/* <a className="prompt" data-track-note="page_open_jobs" href="/jobs">
                <FontAwesomeIcon icon={faHandshake} /> Jobs
            </a> */}
        </div>
    )
}

export const runSiteTools = () => {
    ReactDOM.render(
        <SiteTools />,
        document.querySelector(`.${SITE_TOOLS_CLASS}`)
    )

    const newsletterSubscriptionFormRootHomepage = document.querySelector(
        ".homepage-social-ribbon #newsletter-subscription-root"
    )
    if (newsletterSubscriptionFormRootHomepage) {
        ReactDOM.hydrate(
            <NewsletterSubscriptionForm
                context={NewsletterSubscriptionContext.Homepage}
            />,
            newsletterSubscriptionFormRootHomepage
        )
    }
}
