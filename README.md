# Tume

**AI-Powered Management App for Couples**

A full-stack application featuring agentic AI that processes voice commands via serverless edge functions to seamlessly manage shared tasks, notes, and meal plans.

---

## The Story Behind Tume

Managing daily life as a couple—juggling groceries, chores, random thoughts, and meal prep—can quickly become overwhelming. I realized that traditional to-do list apps require too much friction: opening the app, typing out details, categorizing, and assigning tasks. 

I wanted something completely frictionless for my girlfriend and me. 

So, I built **Tume**. Instead of tapping through menus, you simply speak to it. Tume uses Agentic AI to act as a personal assistant for your relationship. You just tell it to "add a note," "create a task," or "plan our meals," and the AI intelligently processes your voice, categorizes the intent, and instantly updates a shared, real-time database. 

---

##  Key Features

* **Voice-Activated Agentic AI:** Speak naturally to the app. The integrated OpenAI API acts as an agent to determine whether you are adding a task, writing a note, or planning a meal, routing the data accordingly.
* **Frictionless Task & Meal Management:** Completely hands-free organization. Voice-to-text ensures you can manage shared responsibilities even when you're busy cooking or commuting.
* **Real-Time Synchronization:** Built on a robust PostgreSQL database, ensuring that when one partner updates a task or note, it instantly appears on the other's device.
* **Serverless Architecture:** Utilizes edge functions to handle complex AI processing and database routing securely and incredibly fast, without the need for a traditional backend server.

---

##  Tech Stack

* **Frontend:** `React Native`, `TypeScript`, `Expo` (Cross-platform mobile framework for a smooth, native-like experience)
* **Backend & Database:** `Supabase`, `PostgreSQL` (Real-time data syncing and secure authentication)
* **Compute:** `Serverless Edge Functions` (Handling rapid API requests and backend logic)
* **AI & Audio Processing:** `OpenAI API` (Agentic intent recognition), `Speech-to-Text` (Voice processing)

---

## Getting Started

To run Tume on your local machine:

1. **Clone this repository:**
   ```bash
   git clone [https://github.com/andoniit/Tume.git](https://github.com/andoniit/Tume.git)
   cd Tume
