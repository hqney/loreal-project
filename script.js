/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const sendButton = document.getElementById("sendBtn");
/* Cloudflare Worker URL (holds the OpenAI API key securely on the server) */
const WORKER_URL = "https://loreal-api-worker.mg26760.workers.dev";

/* Keep the product data and selected products available as users browse */
let allProducts = [];
let selectedProducts = [];
let isRequestPending = false;

/* Keep the conversation so the advisor can answer follow-up questions */
const messages = [
  {
    role: "system",
    content:
      "You are a L'Oréal skincare and beauty advisor. Build clear, practical routines using the user's selected products and answer follow-up questions using the conversation history. Only answer questions about the generated routine, skincare, haircare, makeup, fragrance, beauty products, or closely related topics. If asked about something unrelated, politely explain that you can only help with beauty-related topics."
  }
];

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Show a message until the user adds a product */
renderSelectedProducts();

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => {
        const isSelected = selectedProducts.some(
          (selectedProduct) => selectedProduct.id === product.id
        );

        return `
    <div class="product-card${isSelected ? " is-selected" : ""}"
      data-product-id="${product.id}"
      role="button"
      tabindex="0"
      aria-pressed="${isSelected}">
      <div class="product-image">
        <img src="${product.image}" alt="${product.name}">
      </div>
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <p class="product-description">${product.description}</p>
      </div>
    </div>
  `;
      }
    )
    .join("");
}

/* Show every selected product with a button to remove it */
function renderSelectedProducts() {
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="selected-empty">No products selected yet.</p>
    `;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-product">
          <span>${product.name}</span>
          <button
            type="button"
            class="remove-selected-product"
            data-product-id="${product.id}"
            aria-label="Remove ${product.name}">
            Remove
          </button>
        </div>
      `
    )
    .join("");
}

/* Refresh the product cards and selected list after a selection changes */
function updateProductSelection() {
  const selectedCategory = categoryFilter.value;
  const visibleProducts = allProducts.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(visibleProducts);
  renderSelectedProducts();
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async () => {
  allProducts = await loadProducts();
  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  updateProductSelection();
});

/* Let users click a product card to add or remove that product */
productsContainer.addEventListener("click", (event) => {
  const productCard = event.target.closest(".product-card");
  if (!productCard) return;

  const productId = Number(productCard.dataset.productId);
  const selectedIndex = selectedProducts.findIndex(
    (product) => product.id === productId
  );

  if (selectedIndex === -1) {
    const product = allProducts.find((item) => item.id === productId);
    if (product) selectedProducts.push(product);
  } else {
    selectedProducts.splice(selectedIndex, 1);
  }

  updateProductSelection();
});

/* Support keyboard selection for product cards */
productsContainer.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;

  const productCard = event.target.closest(".product-card");
  if (!productCard) return;

  event.preventDefault();
  productCard.click();
});

/* Let users remove products directly from the selected-products list */
selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-selected-product");
  if (!removeButton) return;

  const productId = Number(removeButton.dataset.productId);
  selectedProducts = selectedProducts.filter(
    (product) => product.id !== productId
  );

  updateProductSelection();
});

/* Add chat messages as text so the AI response is displayed safely */
function addChatMessage(role, content) {
  const messageElement = document.createElement("p");
  messageElement.className = `chat-message ${role}-message`;
  messageElement.textContent = content;
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return messageElement;
}

/* Show an animated, screen-reader-friendly indicator while the advisor responds */
function addThinkingBubble() {
  const bubble = document.createElement("p");
  bubble.className = "chat-message assistant-message pending-message";
  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-label", "Your advisor is thinking");

  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement("span");
    dot.className = "thinking-dot";
    dot.setAttribute("aria-hidden", "true");
    bubble.appendChild(dot);
  }

  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

addChatMessage(
  "assistant",
  "Ask about skincare, haircare, makeup, fragrance, or generate a routine for more tailored advice."
);

/* Send the full conversation to the class Cloudflare Worker */
async function sendMessageToWorker(userMessage, displayedMessage) {
  if (isRequestPending) return;

  isRequestPending = true;
  messages.push({ role: "user", content: userMessage });
  addChatMessage("user", displayedMessage);
  const responseMessage = addThinkingBubble();
  generateRoutineButton.disabled = true;
  sendButton.disabled = true;

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messages })
    });

    if (!response.ok) {
      throw new Error(`Worker request failed with status ${response.status}.`);
    }

    const data = await response.json();
    const assistantMessage =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    if (typeof assistantMessage !== "string") {
      throw new Error("The Worker response did not contain an assistant message.");
    }

    messages.push({ role: "assistant", content: assistantMessage });
    responseMessage.textContent = assistantMessage;
    responseMessage.classList.remove("pending-message");
    responseMessage.removeAttribute("aria-label");
  } catch (error) {
    console.error("Error sending message to the Worker:", error);
    messages.pop();
    responseMessage.textContent =
      "Sorry, I couldn't get a response. Please try again.";
    responseMessage.classList.remove("pending-message");
    responseMessage.classList.add("error-message");
    responseMessage.removeAttribute("aria-label");
  } finally {
    isRequestPending = false;
    generateRoutineButton.disabled = false;
    sendButton.disabled = false;
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
}

/* Generate a routine using only the products the user selected */
generateRoutineButton.addEventListener("click", () => {
  if (selectedProducts.length === 0) {
    addChatMessage("assistant", "Select one or more products first.");
    return;
  }

  const productDetails = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description
  }));
  const userMessage = `Create a personalized routine using only these selected products. Explain the steps and when to use each product:
${JSON.stringify(productDetails, null, 2)}`;

  sendMessageToWorker(
    userMessage,
    `Please create a routine using my ${productDetails.length} selected product(s).`
  );
});

/* Send follow-up questions with the previous conversation for context */
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isRequestPending) return;

  const formMessage = new FormData(chatForm).get("userInput");
  if (typeof formMessage !== "string" || formMessage.trim() === "") return;

  const userMessage = formMessage.trim();
  chatForm.reset();
  sendMessageToWorker(userMessage, userMessage);
});
