export type room = {
    roomName: string;
    users: string[];
    messages: Message[];
}
type Message = {
    sender: string;
    content: string;
    timestamp: number;
}